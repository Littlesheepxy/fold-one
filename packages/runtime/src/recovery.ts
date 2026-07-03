import type { ActionPlan } from "@fold/ai";
import type { AgentId } from "@fold/connectors";
import type { LiveContext } from "@fold/context";
import {
	hasNativeAppHint,
	isCodeRepairHint,
	isGuiIntent,
	isWorkflowIntent,
	needsClickGui,
	needsVisualRead,
} from "./capability-resolver.js";
import type { StepFailure } from "./executor.js";
import { buildRepairBrief } from "./repair.js";

export { isWorkflowIntent } from "./capability-resolver.js";

export type RepairBackend = "agent" | "browser" | "uitars" | "workbuddy" | "screenshot";

export interface RepairBudget {
	maxAttempts: number;
	maxTurns: number;
	timeoutMs: number;
}

export const DEFAULT_REPAIR_BUDGET: RepairBudget = {
	maxAttempts: 1,
	maxTurns: 10,
	timeoutMs: 180_000,
};

export const GUI_REPAIR_BUDGET: RepairBudget = {
	maxAttempts: 3,
	maxTurns: 10,
	timeoutMs: 120_000,
};

export type RecoveryAction =
	| {
			type: "repair";
			backend: RepairBackend;
			brief: string;
			agent?: AgentId | "auto";
			budget: RepairBudget;
			url?: string;
	  }
	| { type: "abort"; reason: string };

export interface RecoveryContext {
	intent: string;
	liveContext: LiveContext;
	failures: StepFailure[];
	validationFailed: boolean;
	agentsEnabled: boolean;
	availableAgents: AgentId[];
	cdpConnected: boolean;
	uitarsEnabled: boolean;
	uitarsAvailable: boolean;
	workbuddyAvailable: boolean;
	screenCaptureAvailable: boolean;
	screenshotSucceeded: boolean;
	repairAttempts: number;
	maxRepairAttempts: number;
}

export function isNativeGuiContext(intent: string, context: LiveContext): boolean {
	if (!isGuiIntent(intent) && !hasNativeAppHint(intent)) return false;
	const app = context.activeApp?.toLowerCase() ?? "";
	if (hasNativeAppHint(app) || hasNativeAppHint(intent)) return true;
	const isBrowser = /chrome|safari|firefox|edge|arc|browser/i.test(app);
	return isGuiIntent(intent) && !isBrowser && context.recentUrls.length === 0;
}

export function classifyFailure(failure: StepFailure): string {
	const message = failure.error ?? "";
	if (/timeout/i.test(message)) return "timeout";
	if (/not found|enoent/i.test(message)) return "entity.notFound";
	if (/permission|denied|sandbox/i.test(message)) return "permission.denied";
	if (/gui|window|click|browser|playwright|uitars/i.test(message)) return "gui.actionFailed";
	if (/workbuddy|mcp gateway/i.test(message)) return "workflow.failed";
	return "skill.failed";
}

export function selectRepairBackend(ctx: RecoveryContext, attempt: number): RepairBackend {
	if (isWorkflowIntent(ctx.intent) && ctx.workbuddyAvailable && attempt === 0) {
		return "workbuddy";
	}

	const visualRead =
		needsVisualRead(ctx.intent) &&
		!needsClickGui(ctx.intent) &&
		ctx.screenCaptureAvailable &&
		!ctx.screenshotSucceeded;

	if (visualRead && (ctx.validationFailed || attempt === 0)) {
		if (attempt === 0) return "screenshot";
	}

	const guiFailure = ctx.failures.some((f) => classifyFailure(f) === "gui.actionFailed");
	const guiTask = isGuiIntent(ctx.intent) || guiFailure || hasNativeAppHint(ctx.intent);

	if (guiTask && ctx.cdpConnected && attempt === 0) {
		return "browser";
	}

	if (
		guiTask &&
		isNativeGuiContext(ctx.intent, ctx.liveContext) &&
		ctx.uitarsEnabled &&
		attempt <= 1
	) {
		if (attempt === 0 && !ctx.cdpConnected) return "uitars";
		if (attempt === 1 && ctx.cdpConnected) return "uitars";
	}

	return "agent";
}

export function resolveRepairBudget(ctx: RecoveryContext): RepairBudget {
	if (
		needsVisualRead(ctx.intent) &&
		ctx.screenCaptureAvailable &&
		!needsClickGui(ctx.intent)
	) {
		return { maxAttempts: 2, maxTurns: 10, timeoutMs: 120_000 };
	}
	if (
		isGuiIntent(ctx.intent) ||
		isWorkflowIntent(ctx.intent) ||
		hasNativeAppHint(ctx.intent)
	) {
		if (ctx.cdpConnected || ctx.uitarsEnabled || ctx.workbuddyAvailable) {
			return GUI_REPAIR_BUDGET;
		}
	}
	if (ctx.agentsEnabled && ctx.availableAgents.length > 0) {
		return GUI_REPAIR_BUDGET;
	}
	return DEFAULT_REPAIR_BUDGET;
}

export function handleFailure(ctx: RecoveryContext): RecoveryAction | null {
	const budget = resolveRepairBudget(ctx);
	if (ctx.repairAttempts >= budget.maxAttempts) {
		return { type: "abort", reason: "repair budget exhausted" };
	}

	const primary = ctx.failures[0];
	if (!primary && !ctx.validationFailed) return null;

	const backend = selectRepairBackend(ctx, ctx.repairAttempts);
	const recentUrl = ctx.liveContext.recentUrls[0]?.url;

	if (backend === "screenshot") {
		if (!ctx.screenCaptureAvailable) {
			return { type: "abort", reason: "屏幕录制不可用，无法截屏" };
		}
		return {
			type: "repair",
			backend: "screenshot",
			brief: buildScreenshotRepairBrief(ctx.intent, ctx.liveContext),
			budget,
		};
	}

	if (backend === "workbuddy") {
		return {
			type: "repair",
			backend: "workbuddy",
			brief: ctx.intent,
			budget,
		};
	}

	if (backend === "browser") {
		return {
			type: "repair",
			backend: "browser",
			brief: buildGuiRepairBrief(ctx.intent, ctx.liveContext),
			budget,
			url: recentUrl,
		};
	}

	if (backend === "uitars") {
		if (!ctx.uitarsEnabled) {
			return { type: "abort", reason: "UI-TARS 未启用" };
		}
		return {
			type: "repair",
			backend: "uitars",
			brief: buildNativeGuiRepairBrief(ctx.intent, ctx.liveContext),
			budget,
		};
	}

	if (!ctx.agentsEnabled) {
		return { type: "abort", reason: "本地 Agent Subagent 未启用" };
	}
	if (ctx.availableAgents.length === 0) {
		return { type: "abort", reason: "未检测到可用的本地 Agent CLI" };
	}

	if (isRepairCandidate(ctx.intent, ctx.failures) || ctx.validationFailed) {
		return {
			type: "repair",
			backend: "agent",
			brief: buildRepairBrief(ctx.intent, ctx.liveContext, ctx.failures),
			agent: "auto",
			budget,
		};
	}

	if (isGuiIntent(ctx.intent) || hasNativeAppHint(ctx.intent)) {
		return {
			type: "repair",
			backend: "agent",
			brief: buildGuiRepairBrief(ctx.intent, ctx.liveContext),
			agent: "auto",
			budget,
		};
	}

	return { type: "abort", reason: primary?.error ?? "validation failed" };
}

export function buildRecoveryPlan(
	action: Extract<RecoveryAction, { type: "repair" }>,
	failedSteps: string[] = [],
): ActionPlan {
	switch (action.backend) {
		case "browser":
			return buildBrowserRecoveryPlan(action);
		case "screenshot":
			return buildScreenshotRecoveryPlan(action);
		case "uitars":
			return buildUitarsRecoveryPlan(action);
		case "workbuddy":
			return buildWorkbuddyRecoveryPlan(action);
		default:
			return buildAgentRecoveryPlan(action, failedSteps);
	}
}

function buildAgentRecoveryPlan(
	action: Extract<RecoveryAction, { type: "repair" }>,
	failedSteps: string[],
): ActionPlan {
	return {
		goal: `Recovery: ${action.brief.slice(0, 120)}`,
		steps: [
			{
				id: `repair-agent-${Date.now()}`,
				skill: "agent.execute",
				args: {
					brief: action.brief,
					agent: action.agent ?? "auto",
					allowEdits: true,
					maxTurns: action.budget.maxTurns,
					timeoutMs: action.budget.timeoutMs,
					failedSteps,
				},
				retryable: false,
				timeout: action.budget.timeoutMs,
			},
		],
		validate: ["agent.exitOk"],
	};
}

function buildBrowserRecoveryPlan(action: Extract<RecoveryAction, { type: "repair" }>): ActionPlan {
	const steps: ActionPlan["steps"] = [
		{
			id: "browser-read",
			skill: "browser.currentPage",
			args: {},
			retryable: true,
			timeout: 15_000,
		},
	];

	if (action.url) {
		steps.push({
			id: "browser-goto",
			skill: "browser.interact",
			args: { action: "goto", url: action.url },
			dependsOn: ["browser-read"],
			retryable: true,
			timeout: 30_000,
		});
	}

	return {
		goal: `Browser repair: ${action.brief.slice(0, 120)}`,
		steps,
		validate: action.url ? ["browser.page.ready", "browser.interact.ok"] : ["browser.page.ready"],
	};
}

function buildScreenshotRecoveryPlan(
	action: Extract<RecoveryAction, { type: "repair" }>,
): ActionPlan {
	const ocr = needsVisualRead(action.brief);
	return {
		goal: `Screenshot repair: ${action.brief.slice(0, 120)}`,
		steps: [
			{
				id: `repair-screenshot-${Date.now()}`,
				skill: "os.screenshot",
				args: {
					target: "frontmost",
					ocr,
				},
				retryable: true,
				timeout: 30_000,
			},
		],
		validate: ocr ? ["os.screenshot.ok", "os.screenshot.hasText"] : ["os.screenshot.ok"],
	};
}

function buildUitarsRecoveryPlan(action: Extract<RecoveryAction, { type: "repair" }>): ActionPlan {
	return {
		goal: `UI-TARS repair: ${action.brief.slice(0, 120)}`,
		steps: [
			{
				id: `repair-uitars-${Date.now()}`,
				skill: "gui.uitars",
				args: {
					goal: action.brief,
					budget: 5,
				},
				retryable: false,
				timeout: action.budget.timeoutMs,
			},
		],
		validate: ["gui.uitars.ok"],
	};
}

function buildWorkbuddyRecoveryPlan(action: Extract<RecoveryAction, { type: "repair" }>): ActionPlan {
	return {
		goal: `Work Buddy: ${action.brief.slice(0, 120)}`,
		steps: [
			{
				id: `repair-workbuddy-${Date.now()}`,
				skill: "workbuddy.run",
				args: {
					query: action.brief,
					capability: "wb_search",
				},
				retryable: false,
				timeout: action.budget.timeoutMs,
			},
		],
		validate: ["workbuddy.run.ok"],
	};
}

function isRepairCandidate(intent: string, failures: StepFailure[]): boolean {
	if (!failures.length) return isCodeRepairHint(intent);
	return failures.some((failure) => isCodeRepairHint(`${intent} ${failure.error ?? ""}`));
}

function buildGuiRepairBrief(intent: string, context: LiveContext): string {
	return [
		`GUI repair task: ${intent}`,
		`Active app: ${context.activeApp ?? "unknown"}`,
		`Active window: ${context.activeWindow ?? "unknown"}`,
		`Recent URLs: ${context.recentUrls.slice(0, 3).map((u) => u.url).join(", ") || "none"}`,
		"",
		"Use CDP-connected browser state first. Summarize the current page and whether navigation succeeded.",
	].join("\n");
}

function buildNativeGuiRepairBrief(intent: string, context: LiveContext): string {
	return [
		`Native GUI repair task: ${intent}`,
		`Active app: ${context.activeApp ?? "unknown"}`,
		`Active window: ${context.activeWindow ?? "unknown"}`,
		"",
		"Use vision/GUI automation for apps without DOM access. Keep actions minimal.",
	].join("\n");
}

function buildScreenshotRepairBrief(intent: string, context: LiveContext): string {
	return [
		`Visual read task: ${intent}`,
		`Active app: ${context.activeApp ?? "unknown"}`,
		`Active window: ${context.activeWindow ?? "unknown"}`,
		"",
		"Capture the frontmost window and read visible text to answer the user.",
	].join("\n");
}
