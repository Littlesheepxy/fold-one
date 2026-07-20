import { z } from "zod";
import { buildPlannerPrompt, buildReplannerPrompt, type ReplannerPromptInput } from "./prompt.js";
import { gatewayGenerateText } from "./gateway.js";
import { resolveModelChoice } from "./model-choice.js";

export const ActionStepSchema = z.object({
	id: z.string(),
	skill: z.string(),
	args: z.record(z.unknown()),
	dependsOn: z.array(z.string()).optional(),
	retryable: z.boolean().default(true),
	timeout: z.number().default(5000),
});

export const ActionPlanSchema = z.object({
	goal: z.string(),
	steps: z.array(ActionStepSchema),
	validate: z.array(z.string()),
});

export type ActionPlan = z.infer<typeof ActionPlanSchema>;
export type ActionStep = z.infer<typeof ActionStepSchema>;

export async function generateActionPlan(input: {
	intent: string;
	contextSummary: string;
	skillCatalog: string;
	probeSummary?: string;
	relevantEpisodes?: string;
}): Promise<ActionPlan> {
	const choice = resolveModelChoice("planner");
	const { text } = await gatewayGenerateText(
		choice,
		{ prompt: buildPlannerPrompt(input) },
		{ feature: "planner" },
	);

	return normalizeActionPlan(input.intent, parseActionPlan(text));
}

/** LLM Replanner：把失败上下文回喂 planner，生成换路线的恢复计划。 */
export async function generateRecoveryPlan(input: ReplannerPromptInput): Promise<ActionPlan> {
	const choice = resolveModelChoice("planner");
	const { text } = await gatewayGenerateText(
		choice,
		{ prompt: buildReplannerPrompt(input) },
		{ feature: "repair" },
	);

	return normalizeActionPlan(input.intent, parseActionPlan(text));
}

export function isMailCountIntent(intent: string): boolean {
	return /(邮件|mail)/i.test(intent) && /(多少|几封|待处理|未读|状态|count|unread|pending)/i.test(intent);
}

function isClipboardRecallIntentLocal(intent: string): boolean {
	return /(刚才|刚刚|之前).{0,6}(复制|拷贝)|剪贴板|clipboard/i.test(intent);
}

function isExplicitMailIntentLocal(intent: string): boolean {
	return /(邮件|mail|gmail|草稿|邮箱|outlook|苹果邮件)/i.test(intent);
}

function isPdfMailDemoIntentLocal(intent: string): boolean {
	return /刚下载.*pdf.*(邮件|mail|草稿|邮箱)/i.test(intent);
}

function normalizeActionPlan(intent: string, plan: ActionPlan): ActionPlan {
	if (isMailCountIntent(intent) && plan.steps.some((step) => step.skill === "mail.draft")) {
		return mockActionPlan(intent);
	}

	let steps = plan.steps;
	let validate = plan.validate;

	// Strip incidental clipboard.recall on non-clipboard intents
	if (!isClipboardRecallIntentLocal(intent) && steps.some((s) => s.skill === "clipboard.recall")) {
		const removed = new Set(steps.filter((s) => s.skill === "clipboard.recall").map((s) => s.id));
		steps = steps
			.filter((s) => s.skill !== "clipboard.recall")
			.map((s) => ({
				...s,
				dependsOn: s.dependsOn?.filter((d) => !removed.has(d)),
			}));
		validate = validate.filter((v) => !v.startsWith("clipboard."));
	}

	// Strip mail.draft when intent did not ask for mail
	if (
		!isExplicitMailIntentLocal(intent) &&
		!isPdfMailDemoIntentLocal(intent) &&
		steps.some((s) => s.skill === "mail.draft")
	) {
		const removed = new Set(steps.filter((s) => s.skill === "mail.draft").map((s) => s.id));
		steps = steps
			.filter((s) => s.skill !== "mail.draft")
			.map((s) => ({
				...s,
				dependsOn: s.dependsOn?.filter((d) => !removed.has(d)),
			}));
		validate = validate.filter((v) => !v.startsWith("mail.draft"));
	}

	// Prefer finder over os.shell for "recent file" style first steps
	if (
		steps[0]?.skill === "os.shell" &&
		/(下载|桌面|pdf|文件|报价)/i.test(intent) &&
		!/(多少|几个|count)/i.test(intent)
	) {
		steps = [
			{
				id: "s1",
				skill: "finder.latestDownload",
				args: { ext: "pdf", since: "30m" },
				retryable: true,
				timeout: 3000,
			},
			...steps.slice(1).map((s, i) => ({
				...s,
				id: s.id || `s${i + 2}`,
				dependsOn: s.dependsOn?.length ? ["s1"] : s.dependsOn,
			})),
		];
		validate = validate.filter((v) => !v.startsWith("os.shell"));
	}

	return { ...plan, steps, validate };
}

function parseActionPlan(text: string): ActionPlan {
	const trimmed = text.trim();
	const json = trimmed.startsWith("{")
		? trimmed
		: trimmed.slice(trimmed.indexOf("{"), trimmed.lastIndexOf("}") + 1);
	if (!json) throw new Error("Planner 没返回有效计划，请重试");
	try {
		return ActionPlanSchema.parse(JSON.parse(json));
	} catch {
		throw new Error("Planner 没返回有效计划，请重试");
	}
}

/** Fallback when no API key — narrow pattern match, no Jason/mail default. */
export function mockActionPlan(intent: string): ActionPlan {
	if (isMailCountIntent(intent)) {
		return {
			goal: intent,
			steps: [
				{
					id: "s1",
					skill: "mail.open",
					args: {},
					retryable: true,
					timeout: 5000,
				},
				{
					id: "s2",
					skill: "mail.countUnread",
					args: {},
					dependsOn: ["s1"],
					retryable: false,
					timeout: 10000,
				},
			],
			validate: ["mail.unread.counted"],
		};
	}
	if (/(download|下载)/i.test(intent) && /pdf/i.test(intent) && /(多少|几个|count)/i.test(intent)) {
		return {
			goal: intent,
			steps: [
				{
					id: "s1",
					skill: "os.shell",
					args: {
						command: "find",
						args: [".", "-maxdepth", "1", "-type", "f", "-iname", "*.pdf"],
						cwd: "~/Downloads",
					},
					retryable: false,
					timeout: 5000,
				},
			],
			validate: ["os.shell.exitOk"],
		};
	}
	if (isPdfMailDemoIntentLocal(intent) || isExplicitMailIntentLocal(intent)) {
		return {
			goal: intent,
			steps: [
				{
					id: "s1",
					skill: "finder.latestDownload",
					args: { ext: "pdf", since: "30m" },
					retryable: true,
					timeout: 3000,
				},
				{
					id: "s2",
					skill: "pdf.extract",
					args: { fields: ["vendor", "amount", "date"] },
					dependsOn: ["s1"],
					retryable: false,
					timeout: 8000,
				},
				{
					id: "s3",
					skill: "mail.draft",
					args: { template: "quote-summary" },
					dependsOn: ["s2"],
					retryable: true,
					timeout: 5000,
				},
			],
			validate: ["pdf.fields.nonEmpty", "mail.draft.exists"],
		};
	}
	// Generic file/PDF-ish intent: locate + extract only (no send)
	if (/(pdf|报价|下载|桌面|文件)/i.test(intent)) {
		return {
			goal: intent,
			steps: [
				{
					id: "s1",
					skill: "finder.latestDownload",
					args: { ext: "pdf", since: "30m" },
					retryable: true,
					timeout: 3000,
				},
				{
					id: "s2",
					skill: "pdf.extract",
					args: { fields: ["vendor", "amount", "date"] },
					dependsOn: ["s1"],
					retryable: false,
					timeout: 8000,
				},
			],
			validate: ["pdf.fields.nonEmpty"],
		};
	}
	return {
		goal: intent,
		steps: [],
		validate: [],
	};
}
