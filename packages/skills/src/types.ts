import type { LiveContext } from "@fold/context";
import type { AgentTaskEnvelope, LocalTaskEvent } from "@fold/connectors";

export interface ProgressEvent {
	type: "progress";
	message?: string;
	taskEvent?: LocalTaskEvent;
}

export interface SkillContext {
	liveContext: LiveContext;
	previousResults: Map<string, unknown>;
	emit: (event: ProgressEvent) => void;
	/** Current user utterance for connector routing (e.g. Gmail vs Apple Mail). */
	taskIntent?: string;
	/** L2 上下文摘要（AX/日历/置信度）；缺省时 skill 回退 L1 */
	contextSnapshot?: string;
	/** Fold-owned task/memory contract passed unchanged to local Agent workers. */
	agentTaskEnvelope?: AgentTaskEnvelope;
	/** Shared cancellation signal for this Fold run. */
	signal?: AbortSignal;
	lookupSideEffectReceipt?: (idempotencyKey: string) => {
		status: "requested" | "confirmed" | "uncertain" | "failed";
		verification?: unknown;
	} | null;
	recordSideEffectRequest?: (input: {
		idempotencyKey: string;
		connector: string;
		operation: string;
		targetFingerprint: string;
		inputHash: string;
	}) => void;
}

export type SkillHandler = (
	args: Record<string, unknown>,
	ctx: SkillContext,
) => Promise<unknown>;

/** Minimal structural view of an executed step, for manifest validators. */
export interface SkillStepView {
	skill: string;
	status: string;
	output?: unknown;
}

export type SkillValidator = (results: SkillStepView[]) => boolean;

/**
 * Skill Manifest —— 一个 skill 的单一事实源。
 * planner catalog、步骤中文名、验证规则都从这里派生，不再分表维护。
 */
export interface SkillDefinition {
	id: string;
	handler: SkillHandler;
	/** 步骤列表 UI 里的中文名 */
	label: string;
	/** planner SKILL_CATALOG 里的一条（不含开头的 "- "，可多行） */
	catalogDoc: string;
	/** 计划 validate 数组可引用的后置条件规则 */
	validators?: Record<string, SkillValidator>;
}
