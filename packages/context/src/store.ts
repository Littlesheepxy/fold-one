import { randomUUID } from "node:crypto";
import type { ContextEvent, LiveContext } from "./types.js";
import { createEmptyContext } from "./types.js";

const TTL_MS = 30 * 60 * 1000;

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
		return {
			...this.ctx,
			events: [...this.ctx.events],
			recentFiles: [...this.ctx.recentFiles],
			recentUrls: [...this.ctx.recentUrls],
		};
	}

	push(event: Omit<ContextEvent, "id">): ContextEvent | null {
		if (!IMPORTANT_TYPES.has(event.type)) return null;

		// app.active 每 2s 轮询一次；锚点没变就不产生事件，事件流保持为「切换流」。
		if (event.type === "app.active") {
			const sameApp = (event.data.appName ?? null) === this.ctx.activeApp;
			const sameWindow = (event.data.windowTitle ?? null) === this.ctx.activeWindow;
			if (sameApp && sameWindow) return null;
		}

		const full: ContextEvent = { ...event, id: randomUUID() };
		this.ctx.events.push(full);

		if (event.type === "app.active") {
			this.ctx.activeApp = event.data.appName ?? null;
			this.ctx.activeWindow = event.data.windowTitle ?? null;
			this.ctx.activeAppPath = event.data.appPath ?? null;
		}
		if (event.type === "file.created" && event.data.filePath) {
			const name = event.data.filePath.split("/").pop() ?? event.data.filePath;
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
			// 同一 URL 只保留最新一条，避免列表被重复访问刷屏
			this.ctx.recentUrls = this.ctx.recentUrls.filter((u) => u.url !== event.data.url);
			this.ctx.recentUrls.unshift({
				url: event.data.url,
				title,
				timestamp: event.timestamp,
			});
			this.ctx.recentUrls = this.ctx.recentUrls.slice(0, 20);
		}

		this.prune();
		return full;
	}

	private prune() {
		const cutoff = Date.now() - TTL_MS;
		this.ctx.events = this.ctx.events.filter((e) => e.timestamp >= cutoff);
		this.ctx.recentFiles = this.ctx.recentFiles.filter((f) => f.timestamp >= cutoff);
		this.ctx.recentUrls = this.ctx.recentUrls.filter((u) => u.timestamp >= cutoff);
	}
}
