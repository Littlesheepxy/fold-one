import { computeFocusDwells, formatFocusDwellBrief } from "./dwell.js";

export type ContextEventType =
	| "app.active"
	| "app.quit"
	| "file.created"
	| "file.modified"
	| "clipboard.changed"
	| "browser.urlChanged";

export interface ContextEvent {
	id: string;
	type: ContextEventType;
	source: "finder" | "chrome" | "mail" | "system" | "clipboard";
	timestamp: number;
	data: {
		appName?: string;
		windowTitle?: string;
		appPath?: string;
		filePath?: string;
		url?: string;
		text?: string;
		/** user = 用户复制；fold = Fold 注入/恢复，不计入复制记录 */
		origin?: "user" | "fold";
	};
}

export interface ClipboardHistoryEntry {
	id: string;
	text: string;
	timestamp: number;
	appName: string | null;
	windowTitle: string | null;
	appPath: string | null;
}

export interface FocusDwell {
	app: string;
	windowTitle?: string;
	dwellMs: number;
	lastActiveAt: number;
}

export interface LiveContext {
	activeApp: string | null;
	activeWindow: string | null;
	activeAppPath: string | null;
	/** 前台浏览器标签页 URL（Chrome/Arc 等） */
	activeUrl: string | null;
	recentFiles: Array<{ path: string; name: string; timestamp: number }>;
	recentUrls: Array<{ url: string; title: string; timestamp: number }>;
	clipboard: { text: string; timestamp: number } | null;
	/** 用户复制历史（新→旧），用于找回与召回 */
	recentClipboards: ClipboardHistoryEntry[];
	events: ContextEvent[];
	/** 由 ContextStore.get() 根据 events 推算 */
	focusDwells?: FocusDwell[];
}

export function createEmptyContext(): LiveContext {
	return {
		activeApp: null,
		activeWindow: null,
		activeAppPath: null,
		activeUrl: null,
		recentFiles: [],
		recentUrls: [],
		clipboard: null,
		recentClipboards: [],
		events: [],
	};
}

export type ContextBriefScope = "reply" | "aha" | "agent";

const CLIPBOARD_RECENT_MS = 5 * 60 * 1000;

export function formatContextSummary(ctx: LiveContext): string {
	const lines: string[] = [];
	if (ctx.activeApp) lines.push(`Active app: ${ctx.activeApp}`);
	if (ctx.activeWindow) lines.push(`Active window: ${ctx.activeWindow}`);
	if (ctx.recentFiles.length) {
		lines.push("Recent files:");
		for (const f of ctx.recentFiles.slice(0, 5)) {
			lines.push(`  - ${f.name} (${f.path}) at ${new Date(f.timestamp).toISOString()}`);
		}
	}
	if (ctx.recentUrls.length) {
		lines.push("Recent URLs:");
		for (const u of ctx.recentUrls.slice(0, 5)) {
			lines.push(`  - ${u.title ?? u.url} (${u.url})`);
		}
	}
	if (ctx.clipboard?.text) {
		const preview = ctx.clipboard.text.slice(0, 200);
		lines.push(`Clipboard: ${preview}`);
	}
	return lines.join("\n") || "(no context yet)";
}

/** 按消费场景裁剪的工作现场摘要（L1，无实时 AX/OCR）。 */
export function formatContextBrief(ctx: LiveContext, scope: ContextBriefScope): string {
	if (scope === "agent") return formatContextSummary(ctx);

	const lines: string[] = [];
	const now = Date.now();

	const appTrail = ctx.events
		.filter((e) => e.type === "app.active" && e.data.appName)
		.slice(-8)
		.map((e) =>
			e.data.windowTitle ? `${e.data.appName} · ${e.data.windowTitle}` : e.data.appName!,
		);
	if (appTrail.length) {
		lines.push("近期切换：");
		for (const step of appTrail) lines.push(`  - ${step}`);
	}

	const dwellBrief = formatFocusDwellBrief(computeFocusDwells(ctx.events), scope === "aha" ? 3 : 4);
	if (dwellBrief) lines.push(dwellBrief);

	if (ctx.recentFiles.length) {
		lines.push("近期文件：");
		for (const f of ctx.recentFiles.slice(0, 5)) {
			lines.push(`  - ${f.name}`);
		}
	}

	if (scope === "reply" && ctx.recentUrls.length) {
		lines.push("近期网页：");
		for (const u of ctx.recentUrls.slice(0, 5)) {
			lines.push(`  - ${u.title || u.url}`);
		}
	}

	if (ctx.clipboard?.text && now - ctx.clipboard.timestamp < CLIPBOARD_RECENT_MS) {
		lines.push(`近期剪贴板：${ctx.clipboard.text.slice(0, 200)}`);
	}

	if (ctx.recentClipboards.length > 1 && scope !== "reply") {
		lines.push("复制记录（新→旧）：");
		for (const item of ctx.recentClipboards.slice(0, 5)) {
			const when = new Date(item.timestamp).toLocaleTimeString("zh-CN", {
				hour: "2-digit",
				minute: "2-digit",
			});
			const where = item.appName ?? "未知应用";
			lines.push(`  - [${when} · ${where}] ${item.text.slice(0, 120)}`);
		}
	}

	return lines.join("\n") || "（暂无工作现场记录）";
}
