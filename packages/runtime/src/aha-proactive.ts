import type { ContextConfidence } from "@fold/context";
import type { PredictSuggestion } from "./predict.js";

/**
 * Aha 主动提示触发判定：后台监测 → 信心够高且稳 → 只建议，不执行。
 * 纯函数，状态全部显式传入，便于 self-check 与单测。
 */

export type AhaProactiveFrequency = "off" | "low" | "normal" | "high";

export interface AhaProactiveTier {
	/** 后台多久跑一次监测（也是弹出冷却）。 */
	cooldownMs: number;
	/** 每天最多弹几次。 */
	maxPerDay: number;
	/** 触发信心阈值（0–1）。 */
	confidenceThreshold: number;
	/** 触发所需 top 建议信心阈值（0–1）。 */
	suggestionThreshold: number;
}

export const AHA_PROACTIVE_TIERS: Record<Exclude<AhaProactiveFrequency, "off">, AhaProactiveTier> = {
	low: { cooldownMs: 30 * 60 * 1000, maxPerDay: 3, confidenceThreshold: 0.78, suggestionThreshold: 0.85 },
	normal: { cooldownMs: 10 * 60 * 1000, maxPerDay: 6, confidenceThreshold: 0.72, suggestionThreshold: 0.8 },
	high: { cooldownMs: 3 * 60 * 1000, maxPerDay: 12, confidenceThreshold: 0.65, suggestionThreshold: 0.75 },
};

export interface AhaProactiveGateInput {
	enabled: boolean;
	/** 当前情境信心（enrichContext 算出）。 */
	confidence: ContextConfidence;
	/** 是否有可用建议（aha 管线产出的 top suggestions）。 */
	suggestions: PredictSuggestion[];
	/** 距上次 Aha 弹出的毫秒数；从未弹过传 Infinity。 */
	msSinceLastShow: number;
	/** 今天已弹出次数。 */
	shownToday: number;
	/** 每天上限。 */
	maxPerDay: number;
	/** 冷却毫秒。 */
	cooldownMs: number;
	/** 触发信心阈值（0–1）。 */
	confidenceThreshold: number;
	/** 触发所需 top 建议信心阈值（0–1）。 */
	suggestionThreshold: number;
}

export interface AhaProactiveGateDecision {
	show: boolean;
	/** 不弹的原因（诊断/埋点用）。 */
	blockedBy:
		| "disabled"
		| "no-suggestion"
		| "low-confidence"
		| "low-suggestion"
		| "cooldown"
		| "daily-cap"
		| null;
	reason: string;
}

export function decideAhaProactiveShow(input: AhaProactiveGateInput): AhaProactiveGateDecision {
	if (!input.enabled) {
		return { show: false, blockedBy: "disabled", reason: "自动 Aha 已关闭" };
	}
	if (input.shownToday >= input.maxPerDay) {
		return { show: false, blockedBy: "daily-cap", reason: `今天已弹 ${input.shownToday} 次（上限 ${input.maxPerDay}）` };
	}
	if (input.msSinceLastShow < input.cooldownMs) {
		return { show: false, blockedBy: "cooldown", reason: "冷却中" };
	}
	if (input.confidence.level !== "high" || input.confidence.score < input.confidenceThreshold) {
		return {
			show: false,
			blockedBy: "low-confidence",
			reason: `情境信心 ${input.confidence.level} ${input.confidence.score.toFixed(2)} < 阈值 ${input.confidenceThreshold}`,
		};
	}
	const top = input.suggestions[0];
	if (!top) {
		return { show: false, blockedBy: "no-suggestion", reason: "没有可用建议" };
	}
	if (top.confidence < input.suggestionThreshold) {
		return {
			show: false,
			blockedBy: "low-suggestion",
			reason: `top 建议信心 ${top.confidence.toFixed(2)} < 阈值 ${input.suggestionThreshold}`,
		};
	}
	return { show: true, blockedBy: null, reason: `信心 ${input.confidence.score.toFixed(2)}，建议「${top.label}」` };
}

/** 默认阈值：只保留高信心 + 高建议信心，宁缺勿滥。 */
export const DEFAULT_AHA_PROACTIVE = {
	enabled: false,
	cooldownMs: AHA_PROACTIVE_TIERS.normal.cooldownMs,
	maxPerDay: AHA_PROACTIVE_TIERS.normal.maxPerDay,
	confidenceThreshold: AHA_PROACTIVE_TIERS.normal.confidenceThreshold,
	suggestionThreshold: AHA_PROACTIVE_TIERS.normal.suggestionThreshold,
} as const;

/** 档位 → 判定参数；off 返回 null（不跑）。 */
export function ahaProactiveTierFor(
	frequency: AhaProactiveFrequency | undefined | null,
): AhaProactiveTier | null {
	if (!frequency || frequency === "off") return null;
	return AHA_PROACTIVE_TIERS[frequency];
}
