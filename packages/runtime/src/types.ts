import type { ActionPlan } from "@fold/ai";

import type { PredictDraftLine } from "./predict-drafts.js";
import type { PredictPhase } from "./predict.js";
import type { PredictSurface } from "./predict-surface.js";

export type OverlayStatus =
	| "idle"
	| "listening"
	| "predict"
	| "understanding"
	| "planning"
	| "working"
	| "done"
	| "error"
	| "ask";

export type PredictMode = "silent" | "fast" | "full";

export interface PredictSuggestion {
	intent: string;
	label: string;
	confidence: number;
	reason: string;
	sourceEpisodeId?: string;
}

export interface StepView {
	id: string;
	label: string;
	status: "pending" | "running" | "done" | "failed";
}

export interface FoldStateEvent {
	status: OverlayStatus;
	transcript?: string;
	/** Planning / reasoning view (goal, probes, planned steps). */
	thinkingText?: string;
	/** Latest skill progress line while executing. */
	progressMessage?: string;
	steps?: StepView[];
	currentApp?: string | null;
	/** One-line headline result. */
	result?: string | null;
	/** Multi-line narrative summary for the detail popover. */
	resultDetail?: string | null;
	error?: string | null;
	askTitle?: string | null;
	askMessage?: string | null;
	askHint?: string | null;
	askOptions?: Array<{ id: string; label: string }>;
	/** structure=语音整理 · reply=语音拟回复 · agent=执行任务 */
	voiceMode?: "structure" | "reply" | "agent" | null;
	/** ⌥Z 情境预测 */
	predictMode?: PredictMode | null;
	predictPhase?: PredictPhase | null;
	predictSurface?: PredictSurface | null;
	predictAnchor?: string | null;
	predictSuggestions?: PredictSuggestion[];
	predictDrafts?: PredictDraftLine[];
	predictSelectedIntent?: string | null;
	predictDraftsLoading?: boolean;
	predictCursor?: { x: number; y: number } | null;
}

export interface UserActionOption {
	id: string;
	label: string;
}

export interface UserActionRequest {
	title: string;
	message: string;
	hint?: string;
	options: UserActionOption[];
	runContext?: Record<string, unknown>;
}

export interface OrchestratorDeps {
	getLiveContext: () => import("@fold/context").LiveContext;
	dataDir?: string;
	/** Show overlay ask UI and wait until user picks an option. */
	requestUserAction?: (request: UserActionRequest) => Promise<string>;
	/** Run side effects for auth options (open Terminal, open Gmail URL). */
	runUserAction?: (optionId: string, context?: Record<string, unknown>) => Promise<void>;
}

export type StateEmitter = (event: FoldStateEvent) => void;

export interface TaskResult {
	status: "success" | "partial" | "failed";
	intent: string;
	plan: ActionPlan;
	steps: StepResult[];
	episodeId?: string;
	error?: string;
}

export interface StepResult {
	stepId: string;
	skill: string;
	status: "success" | "failed" | "skipped";
	output?: unknown;
	durationMs: number;
	error?: string;
}

export interface StepFailure extends StepResult {
	status: "failed";
	retryable: boolean;
	code?: string;
}
