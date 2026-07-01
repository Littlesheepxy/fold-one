import type { LiveContext } from "@fold/context";

export interface ProgressEvent {
	type: "progress";
	message?: string;
}

export interface SkillContext {
	liveContext: LiveContext;
	previousResults: Map<string, unknown>;
	emit: (event: ProgressEvent) => void;
	/** Current user utterance for connector routing (e.g. Gmail vs Apple Mail). */
	taskIntent?: string;
}

export type SkillHandler = (
	args: Record<string, unknown>,
	ctx: SkillContext,
) => Promise<unknown>;

export interface SkillDefinition {
	id: string;
	handler: SkillHandler;
}
