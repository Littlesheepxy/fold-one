import type { ContextEvent, FocusDwell } from "./types.js";

const FOLD_APP_RE = /electron|fold/i;

function focusKey(app: string, windowTitle?: string): string {
	return `${app}|${windowTitle ?? ""}`;
}

/** 从 app.active 事件链推算各窗口停留时长（末段延续到 now）。 */
export function computeFocusDwells(events: ContextEvent[], now = Date.now()): FocusDwell[] {
	const appEvents = events
		.filter((e) => e.type === "app.active" && e.data.appName)
		.sort((a, b) => a.timestamp - b.timestamp);

	if (!appEvents.length) return [];

	const byKey = new Map<string, FocusDwell>();

	for (let i = 0; i < appEvents.length; i++) {
		const e = appEvents[i]!;
		const app = e.data.appName!;
		if (FOLD_APP_RE.test(app)) continue;

		const windowTitle = e.data.windowTitle?.trim() || undefined;
		const endAt = i + 1 < appEvents.length ? appEvents[i + 1]!.timestamp : now;
		const dwellMs = Math.max(0, endAt - e.timestamp);
		if (dwellMs < 3_000) continue;

		const key = focusKey(app, windowTitle);
		const row = byKey.get(key);
		if (row) {
			row.dwellMs += dwellMs;
			row.lastActiveAt = endAt;
		} else {
			byKey.set(key, { app, windowTitle, dwellMs, lastActiveAt: endAt });
		}
	}

	return [...byKey.values()].sort((a, b) => b.dwellMs - a.dwellMs);
}

export function formatDwellDuration(ms: number): string {
	const sec = Math.round(ms / 1000);
	if (sec < 60) return `${sec} 秒`;
	const min = Math.round(sec / 60);
	if (min < 60) return `${min} 分钟`;
	const hr = Math.round(min / 60);
	return hr < 24 ? `${hr} 小时` : `${Math.round(hr / 24)} 天`;
}

export function formatFocusDwellBrief(dwells: FocusDwell[], limit = 4): string {
	const top = dwells.filter((d) => !FOLD_APP_RE.test(d.app)).slice(0, limit);
	if (!top.length) return "";
	const lines = top.map((d) => {
		const label = d.windowTitle ? `${d.app} · ${d.windowTitle}` : d.app;
		return `  - ${label}（约 ${formatDwellDuration(d.dwellMs)}）`;
	});
	return ["停留较久：", ...lines].join("\n");
}

/** 当前前台锚点的已停留时长（毫秒）。 */
export function currentFocusDwellMs(
	events: ContextEvent[],
	activeApp: string | null,
	activeWindow: string | null,
	now = Date.now(),
): number {
	if (!activeApp) return 0;
	for (let i = events.length - 1; i >= 0; i--) {
		const e = events[i]!;
		if (e.type !== "app.active" || !e.data.appName) continue;
		const sameApp = e.data.appName === activeApp;
		const sameWindow = (e.data.windowTitle ?? null) === (activeWindow ?? null);
		if (sameApp && sameWindow) return Math.max(0, now - e.timestamp);
	}
	return 0;
}
