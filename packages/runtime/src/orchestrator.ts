import {
	generateActionPlan,
	hasPlannerApiKey,
	mockActionPlan,
	type ActionPlan,
} from "@fold/ai";
import type { LiveContext } from "@fold/context";
import { formatContextSummary } from "@fold/context";
import { isAgentSubagentsEnabled } from "@fold/connectors";
import { saveEpisode } from "@fold/memory";
import { ensureExecutionPrerequisites } from "./auth-gate.js";
import { formatCapabilityBrief } from "./capability-brief.js";
import { formatRelevantEpisodes } from "./episode-context.js";
import { buildResultDetail, formatThinkingText } from "./format-result.js";
import { runPlan } from "./executor.js";
import { formatProbeSummary, runProbes, type ProbeRunResult } from "./probe-runner.js";
import { buildReactAgentPlan } from "./repair.js";
import { getAgentProbe, getCdpConnected, runRecoveryLoop } from "./recovery-runner.js";
import { resolveTier, tryCompiledPlan } from "./router.js";
import { labelForSkill } from "./step-labels.js";
import type { OrchestratorDeps, StateEmitter, TaskResult } from "./types.js";
import { validatePlan, type ValidationResult } from "./validator.js";
import { needsVisualRead } from "./visual-intent.js";

export type { OrchestratorDeps } from "./types.js";

export async function runTask(
	intent: string,
	emit: StateEmitter,
	deps: OrchestratorDeps,
): Promise<TaskResult> {
	const context = deps.getLiveContext();

	emit({ status: "understanding", transcript: intent });

	let plan: ActionPlan;
	let probeSummary = "";
	let probeResult: ProbeRunResult | undefined;
	try {
		emit({ status: "planning" });
		probeResult = await runProbes(intent, context);
		probeSummary = formatProbeSummary(probeResult);
		const route = resolveTier(intent, context, probeResult);
		if (route.tier === "react") {
			if (!isAgentSubagentsEnabled()) {
				throw new Error(
					`此任务需要 Tier 2 本地 Agent Subagent（${route.reason}）。请在设置中开启「允许本地 Agent Subagent」。`,
				);
			}
			const agentProbe = getAgentProbe(probeResult);
			if (agentProbe.agents.length === 0) {
				throw new Error(
					`此任务需要 Tier 2，但未检测到可用的本地 Agent CLI（claude / codex / agent）。`,
				);
			}
			plan = buildReactAgentPlan(
				intent,
				agentProbe.preferred ?? "auto",
				getCdpConnected(probeResult),
			);
		} else if (route.tier === "compiled") {
			plan = tryCompiledPlan(intent) ?? mockActionPlan(intent);
		} else if (hasPlannerApiKey()) {
			plan = await generateActionPlan({
				intent,
				contextSummary: formatContextSummary(context),
				probeSummary,
				relevantEpisodes: formatRelevantEpisodes(intent, deps.dataDir),
			});
		} else {
			plan = mockActionPlan(intent);
		}
	} catch (e) {
		emit({ status: "error", error: (e as Error).message });
		return {
			status: "failed",
			intent,
			plan: mockActionPlan(intent),
			steps: [],
			error: (e as Error).message,
		};
	}

	const capabilityBrief = probeResult
		? formatCapabilityBrief(intent, plan, probeResult)
		: "";
	const thinkingText = [formatThinkingText(intent, plan, probeSummary), capabilityBrief]
		.filter(Boolean)
		.join("\n\n");
	emit({
		status: "planning",
		transcript: intent,
		thinkingText,
		steps: plan.steps.map((s) => ({
			id: s.id,
			label: labelForSkill(s.skill),
			status: "pending",
		})),
	});

	if (probeResult) {
		try {
			await ensureExecutionPrerequisites(intent, plan, probeResult, deps);
		} catch (e) {
			emit({ status: "error", error: (e as Error).message });
			return {
				status: "failed",
				intent,
				plan,
				steps: [],
				error: (e as Error).message,
			};
		}
	}

	const skillCtx = {
		liveContext: context,
		previousResults: new Map<string, unknown>(),
		emit: () => {},
		taskIntent: intent,
	};

	const { steps: initialSteps, failures: initialFailures } = await runPlan(plan, skillCtx, emit);
	const initialValidation = validatePlan(plan, initialSteps);
	let steps = initialSteps;
	let validation = initialValidation;

	if (!validation.ok || initialFailures.length > 0) {
		const recovery = await runRecoveryLoop({
			intent,
			plan,
			context,
			probeResult: probeResult ?? { probes: [] },
			skillCtx,
			emit,
			initialSteps,
			initialFailures,
			initialValidation,
		});
		steps = recovery.steps;
		validation = recovery.validation;
	}

	validation = softenValidationForVisualAnswer(intent, steps, validation);

	const userVisibleResult = summarizeTaskResult(intent, steps, validation.ok);
	const resultDetail = buildResultDetail(intent, steps);

	const episode = saveEpisode(
		{
			intent,
			goal: plan.goal,
			plan,
			steps: steps.map((s) => ({
				stepId: s.stepId,
				skill: s.skill,
				status: s.status,
				durationMs: s.durationMs,
				error: s.error,
			})),
			status: validation.ok ? "success" : "partial",
			userVisibleResult,
			probeSummary,
			validationChecks: validation.checks,
			contextEvents: context.events,
		},
		deps.dataDir,
	);

	if (validation.ok) {
		emit({
			status: "done",
			transcript: intent,
			thinkingText,
			result: userVisibleResult,
			resultDetail,
			steps: plan.steps.map((s) => ({
				id: s.id,
				label: labelForSkill(s.skill),
				status: steps.find((r) => r.stepId === s.id)?.status === "success" ? "done" : "failed",
			})),
		});
		return { status: "success", intent, plan, steps, episodeId: episode.id };
	}

	emit({
		status: "error",
		error: validation.checks.find((c) => !c.passed)?.message ?? "Validation failed",
		result: userVisibleResult,
		resultDetail,
		thinkingText,
		steps: plan.steps.map((s) => ({
			id: s.id,
			label: labelForSkill(s.skill),
			status: steps.find((r) => r.stepId === s.id)?.status === "success" ? "done" : "failed",
		})),
	});
	return {
		status: "partial",
		intent,
		plan,
		steps,
		episodeId: episode.id,
		error: "Validation failed",
	};
}

/** Mock run for UI testing without skills */
export async function runMockTask(intent: string, emit: StateEmitter): Promise<void> {
	emit({ status: "understanding", transcript: intent });
	await delay(400);
	emit({ status: "planning" });
	await delay(300);

	const mockSteps: Array<{ id: string; label: string; status: "pending" | "running" | "done" }> = [
		{ id: "1", label: "Found quote.pdf", status: "pending" },
		{ id: "2", label: "Reading PDF", status: "pending" },
		{ id: "3", label: "Creating mail draft", status: "pending" },
	];

	for (let i = 0; i < mockSteps.length; i++) {
		const step = mockSteps[i]!;
		emit({
			status: "working",
			steps: mockSteps.map((s, idx) => ({
				...s,
				status: idx < i ? "done" : idx === i ? "running" : "pending",
			})),
			currentApp: step.id === "3" ? "Mail" : null,
		});
		await delay(600);
		mockSteps[i] = { ...step, status: "done" };
	}

	emit({
		status: "done",
		result: "Mail Draft Ready · 3 fields extracted",
		steps: mockSteps.map((s) => ({ ...s, status: "done" as const })),
	});
	await delay(2000);
	emit({ status: "idle" });
}

function delay(ms: number) {
	return new Promise((r) => setTimeout(r, ms));
}

/** Screenshot + OCR text is enough to answer read-screen intents even if the original plan failed. */
function softenValidationForVisualAnswer(
	intent: string,
	steps: Array<{ skill: string; status: string; output?: unknown }>,
	validation: ValidationResult,
): ValidationResult {
	if (validation.ok || !needsVisualRead(intent)) return validation;
	const shot = steps.find((s) => s.skill === "os.screenshot" && s.status === "success");
	const text = (shot?.output as { text?: string } | undefined)?.text?.trim();
	if (!text) return validation;
	return {
		ok: true,
		checks: [...validation.checks, { rule: "visual.answer", passed: true }],
	};
}

function summarizeTaskResult(
	intent: string,
	steps: Array<{ skill: string; status: string; output?: unknown }>,
	validationOk = true,
) {
	const agentStep = steps.find((s) => s.skill === "agent.execute" && s.status === "success");
	const agentOutput = agentStep?.output as { summary?: string; agentId?: string } | undefined;
	const browserPage = steps.find((s) => s.skill === "browser.currentPage" && s.status === "success");
	const browserOutput = browserPage?.output as { url?: string; title?: string } | undefined;
	if (agentStep && agentOutput?.summary) {
		const prefix = agentOutput.agentId ? `${agentOutput.agentId}: ` : "";
		return `${prefix}${agentOutput.summary}`;
	}
	if (browserOutput?.url) {
		return browserOutput.title
			? `当前页面：${browserOutput.title}（${browserOutput.url}）`
			: `当前页面：${browserOutput.url}`;
	}
	const mailStep = steps.find((s) => s.skill === "mail.draft");
	const unreadStep = steps.find((s) => s.skill === "mail.countUnread" && s.status === "success");
	const pdfStep = steps.find((s) => s.skill === "pdf.extract");
	const shellStep = steps.find((s) => s.skill === "os.shell" && s.status === "success");
	const screenshotStep = steps.find((s) => s.skill === "os.screenshot" && s.status === "success");
	const fields = pdfStep?.output as Record<string, unknown> | undefined;
	const fieldCount = fields ? Object.keys(fields).filter((k) => fields[k]).length : 0;
	const unreadOutput = unreadStep?.output as { count?: number } | undefined;
	const shellOutput = shellStep?.output as { stdout?: string } | undefined;
	const screenshotOutput = screenshotStep?.output as { text?: string; path?: string } | undefined;
	const stdout = shellOutput?.stdout?.trim();
	const lineCount = stdout ? stdout.split(/\r?\n/).filter(Boolean).length : 0;
	const wantsCount = /(多少|几个|count)/i.test(intent);

	if (mailStep) {
		return fieldCount > 0 ? `已创建邮件草稿，提取了 ${fieldCount} 个字段` : "已创建邮件草稿";
	}
	if (unreadStep) return `当前有 ${unreadOutput?.count ?? 0} 封待处理邮件`;
	if (screenshotStep) {
		const text = screenshotOutput?.text?.trim();
		if (text) return text.split(/\r?\n/).slice(0, 3).join(" ").slice(0, 200);
		return `已截取屏幕${screenshotOutput?.path ? `：${screenshotOutput.path}` : ""}`;
	}
	if (shellStep) {
		if (wantsCount) return `已找到 ${lineCount} 条结果`;
		if (stdout) return lineCount > 1 ? `已找到 ${lineCount} 条结果` : `结果：${stdout.slice(0, 120)}`;
		return "命令执行完成";
	}
	return validationOk ? `已完成：${intent}` : `部分完成：${intent}`;
}
