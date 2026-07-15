import { computeFocusDwells, currentFocusDwellMs } from "./dwell.js";
import type { LiveContext } from "./types.js";

export type ContextConfidenceLevel = "high" | "medium" | "low";

export interface ContextConfidence {
	score: number;
	level: ContextConfidenceLevel;
	reasons: string[];
}

const CLIPBOARD_RECENT_MS = 5 * 60 * 1000;
const FOLD_APP_RE = /electron|fold/i;

export interface ContextConfidenceInput {
	screenSnippetChars?: number;
	visitedChromeTabCount?: number;
}

function levelFromScore(score: number): ContextConfidenceLevel {
	if (score >= 0.65) return "high";
	if (score >= 0.38) return "medium";
	return "low";
}

/** 根据 L1 轨迹 + L2 片段评估情境把握度（0–1）。 */
export function scoreContextConfidence(
	ctx: LiveContext,
	input: ContextConfidenceInput = {},
): ContextConfidence {
	let score = 0;
	const reasons: string[] = [];

	const appSwitches = ctx.events.filter((e) => e.type === "app.active").length;
	if (appSwitches >= 2) {
		score += 0.14;
		reasons.push("有多段应用切换");
	}

	const dwells = computeFocusDwells(ctx.events);
	const currentDwell = currentFocusDwellMs(ctx.events, ctx.activeApp, ctx.activeWindow);
	if (currentDwell >= 120_000) {
		score += 0.18;
		reasons.push("当前窗口停留较久");
	} else if (currentDwell >= 45_000) {
		score += 0.08;
	}

	const topDwell = dwells[0]?.dwellMs ?? 0;
	if (topDwell >= 180_000) {
		score += 0.1;
		reasons.push("有明确主任务窗口");
	}

	if (ctx.recentUrls.length >= 1) {
		score += 0.18;
		reasons.push("有浏览记录");
	}
	if (ctx.recentUrls.length >= 3) score += 0.06;

	if (ctx.recentFiles.length >= 1) {
		score += 0.14;
		reasons.push("有近期文件操作");
	}

	if (ctx.clipboard?.text && Date.now() - ctx.clipboard.timestamp < CLIPBOARD_RECENT_MS) {
		score += 0.08;
		reasons.push("有近期剪贴板");
	}

	const snippet = input.screenSnippetChars ?? 0;
	if (snippet >= 120) {
		score += 0.16;
		reasons.push("能读到窗口内容");
	} else if (snippet >= 40) {
		score += 0.07;
	}

	if ((input.visitedChromeTabCount ?? 0) > 0) {
		score += 0.05;
	}

	if (ctx.events.length >= 6) score += 0.06;

	const activeBlob = `${ctx.activeApp ?? ""} ${ctx.activeWindow ?? ""}`;
	if (FOLD_APP_RE.test(activeBlob)) {
		score -= 0.28;
		reasons.push("当前在 Fold 自身界面");
	}

	if (appSwitches <= 1 && !ctx.recentUrls.length && !ctx.recentFiles.length && snippet < 40) {
		score -= 0.12;
		reasons.push("轨迹很少");
	}

	score = Math.max(0, Math.min(1, score));

	return {
		score,
		level: levelFromScore(score),
		reasons,
	};
}

export function hedgedPrefix(level: ContextConfidenceLevel): string {
	if (level === "high") return "";
	if (level === "medium") return "我猜";
	return "还不太确定，不过";
}
