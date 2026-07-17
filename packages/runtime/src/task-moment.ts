import { randomUUID } from "node:crypto";
import type { LiveContext } from "@fold/context";

const DEFAULT_LOOKBACK_MS = 30_000;
const MAX_AX_CHARS = 2_000;
const MAX_CLIPBOARD_CHARS = 500;

export interface TaskMomentEnrichment {
	accessibilityText?: string;
	accessibilityApp?: string;
	accessibilityWindowTitle?: string;
	entities?: string[];
}

export interface TaskMoment {
	taskId: string;
	capturedAt: number;
	window: { start: number; end: number };
	voice: { transcript: string };
	foreground: {
		app: string | null;
		windowTitle: string | null;
		appPath: string | null;
		url: string | null;
	};
	accessibility: {
		app?: string;
		windowTitle?: string;
		excerpt?: string;
		entities: string[];
	};
	clipboard: {
		current?: { text: string; timestamp: number; redacted: boolean };
		recent: Array<{
			id: string;
			text: string;
			timestamp: number;
			appName: string | null;
			windowTitle: string | null;
			redacted: boolean;
		}>;
	};
	recentActivity: {
		files: Array<{ path: string; name: string; timestamp: number }>;
		urls: Array<{ url: string; title: string; timestamp: number }>;
		apps: string[];
	};
	evidenceEventIds: string[];
}

export interface CreateTaskMomentOptions {
	taskId?: string;
	now?: number;
	lookbackMs?: number;
	enrichment?: TaskMomentEnrichment;
}

function clip(text: string | undefined, limit: number): string | undefined {
	const trimmed = text?.trim();
	return trimmed ? trimmed.slice(0, limit) : undefined;
}

function safeClipboardText(text: string): { text: string; redacted: boolean } {
	const sensitive =
		/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:password|passwd|secret|api[_ -]?key|bearer|access[_ -]?token)\b/i.test(
			text,
		) || /\b(?:sk|ghp|xox[baprs])[-_][A-Za-z0-9_-]{12,}\b/.test(text);
	return sensitive
		? { text: "[sensitive clipboard omitted]", redacted: true }
		: { text: clip(text, MAX_CLIPBOARD_CHARS) ?? "", redacted: false };
}

/**
 * Capture a bounded, task-scoped view of Fold's raw context.
 * The moment keeps provenance through event ids; it is not a replacement for raw retention.
 */
export function createTaskMoment(
	intent: string,
	ctx: LiveContext,
	options: CreateTaskMomentOptions = {},
): TaskMoment {
	const capturedAt = options.now ?? Date.now();
	const start = capturedAt - (options.lookbackMs ?? DEFAULT_LOOKBACK_MS);
	const windowEvents = ctx.events.filter(
		(event) => event.timestamp >= start && event.timestamp <= capturedAt,
	);
	const apps = windowEvents
		.filter((event) => event.type === "app.active")
		.map((event) => event.data.appName?.trim())
		.filter((app): app is string => Boolean(app));
	const enrichment = options.enrichment;
	const currentClipboard = ctx.clipboard
		? { ...safeClipboardText(ctx.clipboard.text), timestamp: ctx.clipboard.timestamp }
		: undefined;

	return {
		taskId: options.taskId ?? randomUUID(),
		capturedAt,
		window: { start, end: capturedAt },
		voice: { transcript: intent.trim() },
		foreground: {
			app: ctx.activeApp,
			windowTitle: ctx.activeWindow,
			appPath: ctx.activeAppPath,
			url: ctx.activeUrl,
		},
		accessibility: {
			app: enrichment?.accessibilityApp,
			windowTitle: enrichment?.accessibilityWindowTitle,
			excerpt: clip(enrichment?.accessibilityText, MAX_AX_CHARS),
			entities: [...new Set(enrichment?.entities ?? [])].slice(0, 20),
		},
		clipboard: {
			current: currentClipboard?.text ? currentClipboard : undefined,
			recent: ctx.recentClipboards.slice(0, 5).map((item) => {
				const safe = safeClipboardText(item.text);
				return {
					id: item.id,
					text: safe.text,
					timestamp: item.timestamp,
					appName: item.appName,
					windowTitle: item.windowTitle,
					redacted: safe.redacted,
				};
			}),
		},
		recentActivity: {
			files: ctx.recentFiles.slice(0, 5),
			urls: ctx.recentUrls.slice(0, 5),
			apps: [...new Set(apps)].slice(-8),
		},
		evidenceEventIds: windowEvents.map((event) => event.id),
	};
}

export function formatTaskMoment(moment: TaskMoment): string {
	const lines = [
		`Task id: ${moment.taskId}`,
		`User utterance: ${moment.voice.transcript}`,
	];
	if (moment.foreground.app) lines.push(`Foreground app: ${moment.foreground.app}`);
	if (moment.foreground.windowTitle) {
		lines.push(`Foreground window: ${moment.foreground.windowTitle}`);
	}
	if (moment.foreground.url) lines.push(`Foreground URL: ${moment.foreground.url}`);
	if (moment.accessibility.excerpt) {
		lines.push(`AX excerpt:\n${moment.accessibility.excerpt}`);
	}
	if (moment.accessibility.entities.length) {
		lines.push(`Visible entities: ${moment.accessibility.entities.join(", ")}`);
	}
	if (moment.clipboard.current?.text) {
		lines.push(`Current clipboard: ${moment.clipboard.current.text}`);
	}
	return lines.join("\n");
}
