import { generateText } from "ai";
import { z } from "zod";
import { buildPlannerPrompt } from "./prompt.js";
import { toLanguageModel } from "./providers.js";
import { resolveModelChoice } from "./types.js";

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
	const model = toLanguageModel(choice);

	const { text } = await generateText({
		model,
		prompt: buildPlannerPrompt(input),
	});

	return normalizeActionPlan(input.intent, parseActionPlan(text));
}

export function isMailCountIntent(intent: string): boolean {
	return /(邮件|mail)/i.test(intent) && /(多少|几封|待处理|未读|状态|count|unread|pending)/i.test(intent);
}

function normalizeActionPlan(intent: string, plan: ActionPlan): ActionPlan {
	if (isMailCountIntent(intent) && plan.steps.some((step) => step.skill === "mail.draft")) {
		return mockActionPlan(intent);
	}
	return plan;
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

/** Fallback when no API key — pattern match demo intent */
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
				args: { to: "Jason", template: "quote-summary" },
				dependsOn: ["s2"],
				retryable: true,
				timeout: 5000,
			},
		],
		validate: ["pdf.fields.nonEmpty", "mail.draft.exists"],
	};
}

export function hasPlannerApiKey(): boolean {
	const provider = process.env.FOLD_PLANNER_PROVIDER ?? "openai";
	const envMap: Record<string, string> = {
		openai: "OPENAI_API_KEY",
		anthropic: "ANTHROPIC_API_KEY",
		dashscope: "DASHSCOPE_API_KEY",
		deepseek: "DEEPSEEK_API_KEY",
		moonshot: "MOONSHOT_API_KEY",
		openrouter: "OPENROUTER_API_KEY",
	};
	const key = envMap[provider] ?? "OPENAI_API_KEY";
	return Boolean(process.env[key]?.trim());
}
