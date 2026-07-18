import { randomUUID } from "node:crypto";
import { computeFocusDwells } from "./dwell.js";
import type { ClipboardHistoryEntry, ContextEvent, LiveContext } from "./types.js";
import { createEmptyContext } from "./types.js";

/** 会话内保留时长：重启后从 DB 再加载 */
const TTL_MS = 4 * 60 * 60 * 1000;
const CLIPBOARD_HISTORY_MAX = 50;
const CLIPBOARD_MIN_CHARS = 4;

const IMPORTANT_TYPES = new Set<ContextEvent["type"]>([
	"app.active",
	"file.created",
	"file.modified",
	"clipboard.changed",
	"browser.urlChanged",
	"user.afk",
	"user.active",
]);

function isUserClipboardEvent(event: ContextEvent): boolean {
	return (
		event.type === "clipboard.changed" &&
		event.data.origin !== "fold" &&
		Boolean(event.data.text?.trim()) &&
		(event.data.text?.trim().length ?? 0) >= CLIPBOARD_MIN_CHARS
	);
}

function entryFromClipboardEvent(event: ContextEvent): ClipboardHistoryEntry | null {
	if (!isUserClipboardEvent(event)) return null;
	const text = event.data.text!.trim();
	return {
		id: event.id,
		text,
		timestamp: event.timestamp,
		appName: event.data.appName ?? null,
		windowTitle: event.data.windowTitle ?? null,
		appPath: event.data.appPath ?? null,
	};
}

function rebuildClipboardHistory(events: ContextEvent[]): ClipboardHistoryEntry[] {
	const items: ClipboardHistoryEntry[] = [];
	let lastText = "";
	for (const event of events) {
		const entry = entryFromClipboardEvent(event);
		if (!entry || entry.text === lastText) continue;
		lastText = entry.text;
		items.push(entry);
	}
	return items.slice(-CLIPBOARD_HISTORY_MAX).reverse();
}

export class ContextStore {
	private ctx: LiveContext = createEmptyContext();

	get(): LiveContext {
		this.prune();
		const events = [...this.ctx.events];
		return {
			...this.ctx,
			events,
			recentFiles: [...this.ctx.recentFiles],
			recentUrls: [...this.ctx.recentUrls],
			recentClipboards: [...this.ctx.recentClipboards],
			focusDwells: computeFocusDwells(events),
		};
	}

	/** 从 DB 回放历史事件（启动时调用，不触发 onEvent）。 */
	hydrate(events: ContextEvent[]): void {
		const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
		for (const event of sorted) {
			this.ingest(event, { dedupeAppActive: false });
		}
		this.ctx.recentClipboards = rebuildClipboardHistory(this.ctx.events);
	}

	push(event: Omit<ContextEvent, "id">): ContextEvent | null {
		return this.ingest({ ...event, id: randomUUID() }, { dedupeAppActive: true });
	}

	private ingest(
		event: ContextEvent,
		opts: { dedupeAppActive: boolean },
	): ContextEvent | null {
		if (!IMPORTANT_TYPES.has(event.type)) return null;

		if (opts.dedupeAppActive && event.type === "app.active") {
			const sameApp = (event.data.appName ?? null) === this.ctx.activeApp;
			const sameWindow = (event.data.windowTitle ?? null) === this.ctx.activeWindow;
			if (sameApp && sameWindow) return null;
		}

		if (this.ctx.events.some((e) => e.id === event.id)) return null;

		this.ctx.events.push(event);
		this.applyMutation(event);
		this.prune();
		return event;
	}

	private applyMutation(event: ContextEvent) {
		if (event.type === "app.active") {
			this.ctx.activeApp = event.data.appName ?? null;
			this.ctx.activeWindow = event.data.windowTitle ?? null;
			this.ctx.activeAppPath = event.data.appPath ?? null;
			if (!this.isBrowserApp(event.data.appName)) {
				this.ctx.activeUrl = null;
			}
		}
		if (
			(event.type === "file.created" || event.type === "file.modified") &&
			event.data.filePath
		) {
			const name = event.data.filePath.split("/").pop() ?? event.data.filePath;
			this.ctx.recentFiles = this.ctx.recentFiles.filter((f) => f.path !== event.data.filePath);
			this.ctx.recentFiles.unshift({
				path: event.data.filePath,
				name,
				timestamp: event.timestamp,
			});
			this.ctx.recentFiles = this.ctx.recentFiles.slice(0, 20);
		}
		if (event.type === "clipboard.changed" && event.data.text) {
			if (event.data.origin !== "fold" && event.data.text.length >= CLIPBOARD_MIN_CHARS) {
				this.ctx.clipboard = { text: event.data.text, timestamp: event.timestamp };
			}
			const entry = entryFromClipboardEvent(event);
			if (entry && entry.text !== this.ctx.recentClipboards[0]?.text) {
				this.ctx.recentClipboards = [entry, ...this.ctx.recentClipboards].slice(
					0,
					CLIPBOARD_HISTORY_MAX,
				);
			}
		}
		if (event.type === "browser.urlChanged" && event.data.url) {
			const title = event.data.windowTitle ?? event.data.url;
			this.ctx.recentUrls = this.ctx.recentUrls.filter((u) => u.url !== event.data.url);
			this.ctx.recentUrls.unshift({
				url: event.data.url,
				title,
				timestamp: event.timestamp,
			});
			this.ctx.recentUrls = this.ctx.recentUrls.slice(0, 20);
			this.syncActiveBrowserPage(event.data.appName, event.data.url, title);
		}
	}

	private isBrowserApp(appName: string | null | undefined): boolean {
		return /chrome|arc|edge|brave|safari|firefox/i.test(appName ?? "");
	}

	/** 前台浏览器时同步标签页标题/URL，供语音条展示具体页面。 */
	syncActiveBrowserPage(appName: string | null | undefined, url: string, title: string): void {
		if (!url || !appName) return;
		if ((this.ctx.activeApp ?? "").toLowerCase() !== appName.toLowerCase()) return;
		this.ctx.activeUrl = url;
		const cleaned = title.trim() || url;
		if (!/^google chrome$/i.test(cleaned)) {
			this.ctx.activeWindow = cleaned;
		}
	}

	private prune() {
		const cutoff = Date.now() - TTL_MS;
		this.ctx.events = this.ctx.events.filter((e) => e.timestamp >= cutoff);
		this.ctx.recentFiles = this.ctx.recentFiles.filter((f) => f.timestamp >= cutoff);
		this.ctx.recentUrls = this.ctx.recentUrls.filter((u) => u.timestamp >= cutoff);
		// 复制记录不按时间清理，只按条数上限；事件在本地 DB 永存，重启后由 hydrate 回放
		// ponytail: 回放窗口是最近 400 条事件，跨度过长时更早的复制记录不会恢复；要更久可改为按类型查 DB
		if (this.ctx.clipboard && this.ctx.clipboard.timestamp < cutoff) {
			this.ctx.clipboard = null;
		}
	}
}
