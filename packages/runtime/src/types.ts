import type { ActionPlan } from "@fold/ai";
import type { LocalTaskEvent } from "@fold/connectors";

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
	/** Structured local-agent progress for history, recovery, and richer clients. */
	localTaskEvent?: LocalTaskEvent;
	steps?: StepView[];
	currentApp?: string | null;
	/** One-line headline result. */
	result?: string | null;
	/** Multi-line narrative summary for the detail popover. */
	resultDetail?: string | null;
	/** Result checks shown after execution so completion is explainable. */
	verificationChecks?: Array<{ rule: string; passed: boolean; message?: string }>;
	/** A recent text insertion can be reverted from the completion UI. */
	undoAvailable?: boolean;
	error?: string | null;
	askTitle?: string | null;
	askMessage?: string | null;
	askHint?: string | null;
	askOptions?: Array<{ id: string; label: string }>;
	/** Structured HITL request. Legacy ask* fields remain during migration. */
	interaction?: UserInteractionView | null;
	/** structure=语音整理 · reply=语音拟回复 · agent=执行任务 · interaction=回答暂停节点 */
	voiceMode?: "structure" | "reply" | "agent" | "interaction" | null;
	/** ⌥Z 情境预测 */
	predictMode?: PredictMode | null;
	predictPhase?: PredictPhase | null;
	predictSurface?: PredictSurface | null;
	predictAnchor?: string | null;
	predictSuggestions?: PredictSuggestion[];
	predictDrafts?: PredictDraftLine[];
	/** 代回卡：本次参考了哪些记忆 */
	predictMemoryRefs?: string[];
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
	/** 语音待机截止时间戳（ms）；非空且未过期时热键可复用目标 App */
	voiceStandbyUntil?: number | null;
}

export interface UserActionOption {
	id: string;
	label: string;
	description?: string;
	tone?: "primary" | "secondary" | "danger";
	voiceAliases?: string[];
}

export type UserActionKind =
	| "confirm"
	| "select"
	| "text"
	| "permission"
	| "terminal"
	| "secret"
	| "form";

export type UserActionRisk = "low" | "sensitive" | "external" | "destructive";

export interface UserActionInputPolicy {
	primary: "voice" | "text" | "choice" | "secure" | "terminal";
	allowVoice: boolean;
	allowText: boolean;
	/** Unmatched speech/text may itself answer the node, instead of selecting an option. */
	acceptFreeform: boolean;
}

export interface UserActionRequest {
	id?: string;
	title: string;
	message: string;
	hint?: string;
	options: UserActionOption[];
	kind?: UserActionKind;
	risk?: UserActionRisk;
	input?: Partial<UserActionInputPolicy>;
	collapsible?: boolean;
	expiresAt?: number;
	runContext?: Record<string, unknown>;
}

export interface UserInteractionView {
	id: string;
	title: string;
	message: string;
	hint?: string;
	options: UserActionOption[];
	kind: UserActionKind;
	risk: UserActionRisk;
	input: UserActionInputPolicy;
	collapsible: boolean;
	createdAt: number;
	expiresAt?: number;
	listening?: boolean;
	draft?: string;
	validationMessage?: string;
}

export interface UserActionResponse {
	requestId?: string;
	optionId?: string;
	text?: string;
	modality: "click" | "voice" | "text" | "terminal";
}

export interface OrchestratorDeps {
	getLiveContext: () => import("@fold/context").LiveContext;
	dataDir?: string;
	/** Show overlay ask UI and wait until user picks an option. */
	requestUserAction?: (request: UserActionRequest) => Promise<string>;
	/** Resolve the active HITL card (used by auth-gate auto-poll when ready). */
	resolveUserAction?: (optionId: string) => void;
	/** Run side effects for auth options (open Terminal, open Gmail URL). */
	runUserAction?: (optionId: string, context?: Record<string, unknown>) => Promise<void>;
	/** Abort the active run and any cooperative local worker processes. */
	signal?: AbortSignal;
	/** Optional cwd for Tier-2 agent.execute (e.g. stress repo). */
	agentCwd?: string;
	/** 任务时刻截图（desktop 注入，走 macos-input/screencapture）；返回本地路径 */
	captureTaskMomentScreenshot?: (taskId: string) => Promise<string | null>;
	/** Apple Vision OCR 兜底（desktop 注入，走 macos-input addon） */
	ocrImageFile?: (path: string) => Promise<{ text?: string } | null>;
}

export type StateEmitter = (event: FoldStateEvent) => void;

export interface TaskResult {
	/** Present on newer runs; optional while orchestrator migrates. */
	runId?: string;
	status: "success" | "partial" | "failed" | "canceled";
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
