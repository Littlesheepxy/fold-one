import type { ClipboardHistoryEntry } from "./types.js";

const RECALL_HINTS =
	/(复制|剪贴板|clipboard|拷贝|粘贴板).*(什么|啥|哪|内容|记录|历史|找回|上一|刚才|之前|几分钟|分钟前)/i;
const RECALL_SHORT = /(上一段|上一条|刚才复制|之前复制|复制记录|剪贴板历史)/i;

export function isClipboardRecallIntent(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return false;
	return RECALL_HINTS.test(trimmed) || RECALL_SHORT.test(trimmed);
}

export interface ClipboardRecallResult {
	ok: boolean;
	summary: string;
	text?: string;
	entry?: ClipboardHistoryEntry;
	entries?: ClipboardHistoryEntry[];
}

function formatWhen(ts: number): string {
	return new Date(ts).toLocaleString("zh-CN", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function pickByMinutesAgo(history: ClipboardHistoryEntry[], minutes: number): ClipboardHistoryEntry | null {
	if (!history.length) return null;
	const target = Date.now() - minutes * 60_000;
	let best: ClipboardHistoryEntry | null = null;
	let bestDelta = Infinity;
	for (const item of history) {
		const delta = Math.abs(item.timestamp - target);
		if (delta < bestDelta) {
			bestDelta = delta;
			best = item;
		}
	}
	return bestDelta <= 8 * 60_000 ? best : null;
}

function pickByOffset(history: ClipboardHistoryEntry[], offset: number): ClipboardHistoryEntry | null {
	if (offset < 0 || offset >= history.length) return null;
	return history[offset] ?? null;
}

const CONTENT_QUERY_HINTS =
	/(关于|有关|提到|写着|包含|是什|哪段|那条|那段|那句|那段话|那句话|里的|里面的|内容)/;

/** 从口语 query 提取内容关键词（供 FTS 搜索）。 */
export function extractClipboardContentQuery(query: string): string {
	const cleaned = query
		.replace(
			/(帮我|给我|找一下|找找|找回|找到|找出|搜一下|搜索|查一下|查看|看看|复制|剪贴板|拷贝|粘贴板|记录|历史|之前|刚才|最近|那条|那段|那句|那段话|那句话|关于|有关|提到|写着|包含|内容|的|了|吗|呢|吧|啊|一下)/gi,
			" ",
		)
		.replace(/[?!。？！]/g, " ")
		.trim();
	const terms = cleaned.split(/\s+/).filter((t) => t.length >= 2);
	return terms.slice(0, 6).join(" ");
}

export function isClipboardContentRecallIntent(query: string): boolean {
	return CONTENT_QUERY_HINTS.test(query) && extractClipboardContentQuery(query).length >= 2;
}

export function resolveClipboardRecall(
	query: string,
	history: ClipboardHistoryEntry[],
): ClipboardRecallResult {
	if (!history.length) {
		return { ok: false, summary: "还没有复制记录。复制几段文字后我就能帮你找回。" };
	}

	const wantsList = /(哪些|什么|列表|记录|历史|最近)/i.test(query) && !/上一|刚才|之前|分钟/.test(query);
	if (wantsList) {
		const lines = history.slice(0, 5).map((item, index) => {
			const where = item.appName ?? "未知应用";
			const preview = item.text.slice(0, 80) + (item.text.length > 80 ? "…" : "");
			return `${index + 1}. [${formatWhen(item.timestamp)} · ${where}] ${preview}`;
		});
		return {
			ok: true,
			summary: `最近 ${Math.min(history.length, 5)} 条复制：\n${lines.join("\n")}`,
			entries: history.slice(0, 5),
		};
	}

	const minutesMatch = query.match(/(\d+)\s*分钟/);
	if (minutesMatch) {
		const entry = pickByMinutesAgo(history, Number(minutesMatch[1]));
		if (!entry) {
			return { ok: false, summary: `没找到约 ${minutesMatch[1]} 分钟前的复制记录。` };
		}
		const where = entry.appName ?? "未知应用";
		return {
			ok: true,
			summary: `${formatWhen(entry.timestamp)} · ${where}：${entry.text.slice(0, 200)}`,
			text: entry.text,
			entry,
		};
	}

	if (/两分钟|2分钟/.test(query)) {
		const entry = pickByMinutesAgo(history, 2);
		if (!entry) return { ok: false, summary: "没找到约 2 分钟前的复制记录。" };
		const where = entry.appName ?? "未知应用";
		return {
			ok: true,
			summary: `${formatWhen(entry.timestamp)} · ${where}：${entry.text.slice(0, 200)}`,
			text: entry.text,
			entry,
		};
	}

	const offset = /上上|前两|前2/.test(query) ? 2 : /上一|刚才|之前|上条|那段/.test(query) ? 1 : 0;
	const entry = pickByOffset(history, offset);
	if (!entry) {
		return {
			ok: false,
			summary: offset > 0 ? "没有更早的复制记录了。" : "还没有复制记录。",
		};
	}
	const where = entry.appName ?? "未知应用";
	const label = offset === 0 ? "最近一条" : offset === 1 ? "上一条" : "前两条之一";
	return {
		ok: true,
		summary: `${label}（${formatWhen(entry.timestamp)} · ${where}）：${entry.text.slice(0, 240)}`,
		text: entry.text,
		entry,
	};
}

export interface ClipboardRecoveryOffer {
	previous: ClipboardHistoryEntry;
	current: ClipboardHistoryEntry;
}

/** 刚换复制且存在上一条时，提示用户可找回（主页横幅用，不做时间限制）。 */
export function offerClipboardRecovery(
	history: ClipboardHistoryEntry[],
): ClipboardRecoveryOffer | null {
	if (history.length < 2) return null;
	const current = history[0]!;
	const previous = history[1]!;
	if (current.text === previous.text) return null;
	return { previous, current };
}
