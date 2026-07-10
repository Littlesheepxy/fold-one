import type { ActionPlan } from "@fold/ai";
import { saveEpisode, type EpisodeStep } from "./episode.js";

export type VoiceInteractionKind = "structure" | "reply" | "agent";

export interface VoiceInteractionInput {
	kind: VoiceInteractionKind;
	/** 用户原始口述 */
	transcript: string;
	/** 产出文本（整理结果 / 插入的回复等） */
	outcome?: string;
	appName?: string | null;
	windowTitle?: string | null;
	contextEvents?: Array<{ type?: string; source?: string; data?: Record<string, unknown> }>;
}

function kindPrefix(kind: VoiceInteractionKind): string {
	if (kind === "structure") return "转写";
	if (kind === "reply") return "代回";
	return "Agent";
}

function skillForKind(kind: VoiceInteractionKind): string {
	if (kind === "structure") return "voice.structure";
	if (kind === "reply") return "voice.reply";
	return "voice.agent";
}

/** 将转写 / 代回 / 语音 Agent 记入 episode，供习惯挖掘与记忆页使用。 */
export function saveVoiceInteraction(input: VoiceInteractionInput, dataDir?: string): void {
	const transcript = input.transcript.trim();
	if (!transcript) return;

	const prefix = kindPrefix(input.kind);
	const intent = `${prefix}：${transcript.slice(0, 120)}`;
	const outcome = input.outcome?.trim() || transcript;
	const plan: ActionPlan = { goal: intent, steps: [], validate: [] };
	const steps: EpisodeStep[] = [
		{
			stepId: "voice",
			skill: skillForKind(input.kind),
			status: "success",
			durationMs: 0,
			label: prefix,
		},
	];

	saveEpisode(
		{
			intent,
			goal: outcome.slice(0, 200),
			plan,
			steps,
			status: "success",
			userVisibleResult: outcome.slice(0, 160),
			resultDetail: outcome,
			contextEvents: input.contextEvents?.length
				? input.contextEvents
				: input.appName
					? [
							{
								type: "app.active",
								source: "system",
								data: {
									appName: input.appName ?? undefined,
									windowTitle: input.windowTitle ?? undefined,
								},
							},
						]
					: [],
		},
		dataDir,
	);
}
