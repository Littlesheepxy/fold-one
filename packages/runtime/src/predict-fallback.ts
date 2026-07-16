import type { LiveContext } from "@fold/context";
import type { PredictEnrichment, PredictSuggestion } from "./predict.js";
import { inferPredictSurface } from "./predict-surface.js";

const WECHAT_APP_RE = /微信|wechat/i;
/** 高于 FAST_THRESHOLD(0.55)，直接进 result 出草案 */
const CHAT_REPLY_FALLBACK_CONFIDENCE = 0.58;

export function isWeChatApp(app: string | null | undefined): boolean {
	return !!app && WECHAT_APP_RE.test(app);
}

export function frontAppName(ctx: LiveContext, enrichment: PredictEnrichment): string | null {
	return enrichment.accessibilityApp?.trim() || ctx.activeApp?.trim() || null;
}

export function predictContextSnippet(enrichment: PredictEnrichment): string {
	return [enrichment.accessibilityText, enrichment.screenText].filter(Boolean).join("\n").trim();
}

/** 微信等聊天：无 episode 历史时仍给出「拟回复」意图（置信度够进 result） */
export function chatReplyFallbackSuggestion(
	ctx: LiveContext,
	enrichment: PredictEnrichment,
	topScore: number,
): PredictSuggestion | null {
	if (topScore >= CHAT_REPLY_FALLBACK_CONFIDENCE) return null;

	const app = frontAppName(ctx, enrichment);
	if (!isWeChatApp(app)) return null;
	if (inferPredictSurface(ctx, enrichment) !== "reply") return null;

	const snippet = predictContextSnippet(enrichment);
	return {
		intent: "回复当前微信消息",
		label: "拟回复",
		confidence: CHAT_REPLY_FALLBACK_CONFIDENCE,
		reason:
			snippet.length > 30
				? "当前在微信，根据窗口内容拟回复"
				: "当前在微信聊天窗口",
	};
}

export function shouldOcrForChatReply(enrichment: PredictEnrichment): boolean {
	if (!isWeChatApp(enrichment.accessibilityApp)) return false;
	if (enrichment.screenText && enrichment.screenText.length >= 40) return false;
	return true;
}
