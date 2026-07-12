import type {
	OverlayStatus,
	ResolvedThought,
	SurfaceLayout,
	ThoughtPhase,
} from "@fold/runtime";

export interface InteractionState {
	state: OverlayStatus;
	isSpeaking: boolean;
}

export interface AsrState {
	hasInterimText: boolean;
}

export interface AgentRunState {
	isLongRunning: boolean;
}

export interface SemanticSurfaceContext {
	interaction: InteractionState;
	asr: AsrState;
	thought: ResolvedThought | null;
	thoughtPhase: ThoughtPhase;
	hasDraft: boolean;
	agentRun: AgentRunState | null;
}

export function shouldShowThought(thought: ResolvedThought | null): boolean {
	return (
		thought !== null &&
		thought.confidence >= 0.85 &&
		thought.noveltyScore >= 0.6 &&
		thought.stableForMs >= 500
	);
}

/** 底部 = 是否还在表达；顶部 = 是否有值得展示的 A+1。二者可并存。 */
export function resolveSemanticSurfaces(ctx: SemanticSurfaceContext): SurfaceLayout {
	const showInput = ctx.interaction.isSpeaking && ctx.asr.hasInterimText;
	const showThought = shouldShowThought(ctx.thought);

	return {
		input: showInput,
		thought: showThought,
		card:
			(ctx.thoughtPhase === "ready" || ctx.thoughtPhase === "handoff") && ctx.hasDraft,
		orb: ctx.interaction.state === "idle" || Boolean(ctx.agentRun?.isLongRunning),
	};
}
