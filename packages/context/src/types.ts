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
	};
}

export interface LiveContext {
	activeApp: string | null;
	activeWindow: string | null;
	activeAppPath: string | null;
	recentFiles: Array<{ path: string; name: string; timestamp: number }>;
	recentUrls: Array<{ url: string; title: string; timestamp: number }>;
	clipboard: { text: string; timestamp: number } | null;
	events: ContextEvent[];
}

export function createEmptyContext(): LiveContext {
	return {
		activeApp: null,
		activeWindow: null,
		activeAppPath: null,
		recentFiles: [],
		recentUrls: [],
		clipboard: null,
		events: [],
	};
}

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
