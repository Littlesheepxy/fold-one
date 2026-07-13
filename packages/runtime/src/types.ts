import type { ActionPlan } from "@fold/ai";

import type { PredictDraftLine } from "./predict-drafts.js";
import type { PredictPhase } from "./predict.js";
import type { PredictSurface } from "./predict-surface.js";

export type OverlayStatus =
	| "idle"
	| "listening"
	| "predict"
	| "formatting"
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
	/** 代回 / 拟回复时的前台应用（用于展示图标） */
	contextAppName?: string | null;
	contextAppPath?: string | null;
	/** 代回时的窗口/群聊标题 */
	contextWindowTitle?: string | null;
	/** 前台网页 URL（Chrome 等），用于 favicon 与页面标题 */
	contextPageUrl?: string | null;
	/** 语音条上展示的页面短标题 */
	contextPageLabel?: string | null;
	/** 确认卡上按住右 ⌘ 修改草案 */
	predictRefining?: boolean;
	/** 转写/代回胶囊在跨屏 overlay 内的定位（主进程按锚点显示器计算） */
	voiceTabPlacement?: { left: number; top: number } | null;
	/** 引导口述时语音条内的示例/提示文案 */
	voiceHint?: string | null;
	/** 悬浮球所在显示器 workArea，overlay 窗口内坐标（多屏 span 下吸附边界） */
	widgetDisplayBounds?: { x: number; y: number; width: number; height: number } | null;
	/** 转写完成且未开启自动插入时，展示可编辑草稿卡 */
	structureDraftOpen?: boolean;
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
