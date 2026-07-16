import type { LiveContext } from "@fold/context";
import type { PredictEnrichment } from "./predict.js";

export type PredictSurface = "reply" | "task" | "todo";

const REPLY_RE =
	/mail|gmail|outlook|邮件|微信|wechat|slack|飞书|lark|钉钉|dingtalk|消息|回复|chat\.|messenger|telegram/i;
const TODO_RE = /待办|todo|提醒|记住|跟进/i;
const SCHEDULE_RE = /日程|会议|邀约|calendar|开会|约/i;

export function inferPredictSurface(
	ctx: LiveContext,
	enrichment: PredictEnrichment = {},
	intentHint?: string,
): PredictSurface {
	const blob = [
		ctx.activeApp,
		ctx.activeWindow,
		enrichment.accessibilityApp,
		enrichment.accessibilityWindowTitle,
		enrichment.accessibilityText?.slice(0, 800),
		enrichment.screenText?.slice(0, 400),
		intentHint,
		...(enrichment.chromeTabs ?? []).slice(0, 3).map((t) => `${t.title} ${t.url}`),
	]
		.filter(Boolean)
		.join(" ");

	if (TODO_RE.test(blob) || TODO_RE.test(intentHint ?? "")) return "todo";
	if (SCHEDULE_RE.test(blob) && !REPLY_RE.test(blob)) return "todo";
	if (REPLY_RE.test(blob)) return "reply";
	return "task";
}

export function surfaceActionLabel(surface: PredictSurface): string {
	if (surface === "reply") return "拟回复";
	if (surface === "todo") return "拟待办";
	return "建议";
}
