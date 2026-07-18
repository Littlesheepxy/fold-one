import type { LiveContext } from "@fold/context";
import { formatRelevantEpisodes } from "./episode-context.js";
import {
	buildAgentPlannerContextSummary,
	type EnrichedContext,
} from "./context-enrich.js";
import { formatPlannerMemory } from "./trace-retrieval.js";
import {
	createTaskMoment,
	formatTaskMoment,
	type TaskMoment,
} from "./task-moment.js";

export interface AssembledTaskContext {
	moment: TaskMoment;
	enriched: EnrichedContext;
	contextSummary: string;
	memoryBrief: string;
	agentContext: string;
}

/** One context assembly path shared by the planner and local coding agents. */
export async function assembleTaskContext(
	intent: string,
	ctx: LiveContext,
	dataDir?: string,
	taskId?: string,
	enrichOptions?: {
		captureTaskMomentScreenshot?: (taskId: string) => Promise<string | null>;
		ocrImageFile?: (
			path: string,
			region?: { x: number; y: number; width: number; height: number },
		) => Promise<{ text?: string } | null>;
	},
): Promise<AssembledTaskContext> {
	const { summary, enriched } = await buildAgentPlannerContextSummary(ctx, {
		...enrichOptions,
		taskId,
	});
	const moment = createTaskMoment(intent, ctx, {
		taskId,
		enrichment: {
			accessibilityText: enriched.enrichment.accessibilityText,
			accessibilityApp: enriched.enrichment.accessibilityApp,
			accessibilityWindowTitle: enriched.enrichment.accessibilityWindowTitle,
			accessibilitySourceKind: enriched.enrichment.accessibilitySourceKind,
			screenshotPath: enriched.enrichment.screenshotPath,
			entities: enriched.enrichment.entities,
		},
	});
	const memoryBrief = formatPlannerMemory(
		intent,
		ctx,
		formatRelevantEpisodes(intent, dataDir),
		dataDir,
		enriched.screenSnippet || intent,
	);
	const agentContext = [
		summary,
		`Task moment:\n${formatTaskMoment(moment)}`,
		memoryBrief ? `Relevant Fold memory:\n${memoryBrief}` : "",
	]
		.filter(Boolean)
		.join("\n\n");

	return { moment, enriched, contextSummary: summary, memoryBrief, agentContext };
}
