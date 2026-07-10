import { randomUUID } from "node:crypto";
import { computeFocusDwells } from "./dwell.js";
import type { ContextEvent, LiveContext } from "./types.js";
import { createEmptyContext } from "./types.js";

/** 会话内保留时长：重启后从 DB 再加载 */
const TTL_MS = 4 * 60 * 60 * 1000;

const IMPORTANT_TYPES = new Set<ContextEvent["type"]>([
	"app.active",
	"file.created",
	"file.modified",
	"clipboard.changed",
	"browser.urlChanged",
]);

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
			focusDwells: computeFocusDwells(events),
		};
	}

	/** 从 DB 回放历史事件（启动时调用，不触发 onEvent）。 */
	hydrate(events: ContextEvent[]): void {
		const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
		for (const event of sorted) {
			this.ingest(event, { dedupeAppActive: false });
		}
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
			if (event.data.text.length >= 20) {
				this.ctx.clipboard = { text: event.data.text, timestamp: event.timestamp };
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
		}
	}

	private prune() {
		const cutoff = Date.now() - TTL_MS;
		this.ctx.events = this.ctx.events.filter((e) => e.timestamp >= cutoff);
		this.ctx.recentFiles = this.ctx.recentFiles.filter((f) => f.timestamp >= cutoff);
		this.ctx.recentUrls = this.ctx.recentUrls.filter((u) => u.timestamp >= cutoff);
		if (this.ctx.clipboard && this.ctx.clipboard.timestamp < cutoff) {
			this.ctx.clipboard = null;
		}
	}
}
