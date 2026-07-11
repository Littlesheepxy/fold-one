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

/** 刚换复制且存在上一条时，提示用户可找回。 */
export function offerClipboardRecovery(
	history: ClipboardHistoryEntry[],
	now = Date.now(),
): ClipboardRecoveryOffer | null {
	if (history.length < 2) return null;
	const current = history[0]!;
	const previous = history[1]!;
	if (current.text === previous.text) return null;
	if (now - current.timestamp > 3 * 60_000) return null;
	return { previous, current };
}
