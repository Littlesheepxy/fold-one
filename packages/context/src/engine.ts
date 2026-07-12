import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import type { ContextEvent } from "./types.js";
import { ContextStore } from "./store.js";
import { defaultWatchRoots, FILE_WATCH_IGNORED, mergeWatchRoots, watchRootsFromEnv, type WatchRoot } from "./watch-paths.js";

const execFileAsync = promisify(execFile);

const FILE_MODIFIED_DEBOUNCE_MS = 2_000;

export interface ContextEngineOptions {
	downloadsDir?: string;
	/** 额外监听目录（绝对路径） */
	watchDirs?: string[];
	/** 前台轮询忽略的 App（如 Fold 自身），避免打开 Home 窗口时锚点变成自己 */
	ignoreApps?: string[];
	onEvent?: (event: ContextEvent) => void;
}

export class ContextEngine {
	private store = new ContextStore();
	private watchers: FSWatcher[] = [];
	private clipboardTimer: ReturnType<typeof setInterval> | null = null;
	private appTimer: ReturnType<typeof setInterval> | null = null;
	private lastClipboard = "";
	private lastBrowserUrl = "";
	private suppressClipboardUntil = 0;
	private modifiedTimers = new Map<string, ReturnType<typeof setTimeout>>();

	constructor(private opts: ContextEngineOptions = {}) {}

	async refreshActiveApp(): Promise<void> {
		await this.pollActiveApp();
	}

	getLiveContext() {
		return this.store.get();
	}

	/** 启动时从 DB 回放近期 context_events。 */
	hydrate(events: ContextEvent[]) {
		this.store.hydrate(events);
	}

	/** Test / dev: inject a context event */
	pushEvent(event: Omit<ContextEvent, "id">) {
		this.push(event);
	}

	start() {
		this.startFileWatchers();
		this.appTimer = setInterval(() => void this.pollActiveApp(), 2000);
		this.clipboardTimer = setInterval(() => void this.pollClipboard(), 1500);
		void this.pollActiveApp();
	}

	stop() {
		for (const w of this.watchers) void w.close();
		this.watchers = [];
		for (const timer of this.modifiedTimers.values()) clearTimeout(timer);
		this.modifiedTimers.clear();
		if (this.appTimer) clearInterval(this.appTimer);
		if (this.clipboardTimer) clearInterval(this.clipboardTimer);
	}

	/** Fold 写入剪贴板时短暂跳过轮询，避免污染复制记录。 */
	suppressClipboardCapture(ms = 4000): void {
		this.suppressClipboardUntil = Date.now() + ms;
	}

	private resolveWatchRoots(): WatchRoot[] {
		const downloads = this.opts.downloadsDir ?? join(homedir(), "Downloads");
		const extras = (this.opts.watchDirs ?? [])
			.filter(Boolean)
			.map((path) => ({ path, depth: 5 as const }));

		return mergeWatchRoots(
			defaultWatchRoots(),
			[{ path: downloads, depth: 2 }],
			watchRootsFromEnv(),
			extras,
		);
	}

	private startFileWatchers() {
		for (const root of this.resolveWatchRoots()) {
			const watcher = chokidar.watch(root.path, {
				ignored: FILE_WATCH_IGNORED,
				persistent: true,
				ignoreInitial: true,
				depth: root.depth,
				awaitWriteFinish: { stabilityThreshold: 600, pollInterval: 120 },
			});

			watcher.on("add", (filePath) => {
				this.pushFileEvent("file.created", filePath);
			});

			watcher.on("change", (filePath) => {
				this.scheduleFileModified(filePath);
			});

			this.watchers.push(watcher);
		}
	}

	private pushFileEvent(type: "file.created" | "file.modified", filePath: string) {
		this.push({
			type,
			source: "finder",
			timestamp: Date.now(),
			data: { filePath, appName: "Finder" },
		});
	}

	private scheduleFileModified(filePath: string) {
		const pending = this.modifiedTimers.get(filePath);
		if (pending) clearTimeout(pending);
		this.modifiedTimers.set(
			filePath,
			setTimeout(() => {
				this.modifiedTimers.delete(filePath);
				this.pushFileEvent("file.modified", filePath);
			}, FILE_MODIFIED_DEBOUNCE_MS),
		);
	}

	private async pollActiveApp() {
		if (process.platform !== "darwin") return;
		try {
			const { stdout } = await execFileAsync("osascript", [
				"-e",
				'tell application "System Events" to set frontProc to first application process whose frontmost is true',
				"-e",
				'tell application "System Events" to set procName to name of frontProc',
				"-e",
				'try',
				"-e",
				'tell application "System Events" to set procPath to POSIX path of application file of frontProc',
				"-e",
				'on error',
				"-e",
				'set procPath to ""',
				"-e",
				'end try',
				"-e",
				'procName & linefeed & procPath',
			]);
			const [appName = "", appPath = ""] = stdout.split("\n").map((s) => s.trim());
			if (!appName) return;
			if (this.opts.ignoreApps?.some((n) => n.toLowerCase() === appName.toLowerCase())) {
				return;
			}
			const { stdout: titleOut } = await execFileAsync("osascript", [
				"-e",
				'tell application "System Events" to get name of window 1 of (first application process whose frontmost is true)',
			]).catch(() => ({ stdout: "" }));
			this.push({
				type: "app.active",
				source: "system",
				timestamp: Date.now(),
				data: {
					appName,
					windowTitle: titleOut.trim() || undefined,
					appPath: appPath || undefined,
				},
			});
			await this.pollBrowserUrl(appName);
		} catch {
			/* ignore */
		}
	}

	private async pollBrowserUrl(appName: string) {
		if (process.platform !== "darwin") return;
		if (!/chrome|arc|brave|microsoft edge/i.test(appName)) return;

		try {
			let url = "";
			let title = "";
			if (/chrome/i.test(appName)) {
				const { stdout } = await execFileAsync("osascript", [
					"-e",
					'tell application "Google Chrome" to get (URL of active tab of front window) & linefeed & (title of active tab of front window)',
				]);
				[url = "", title = ""] = stdout.split("\n").map((s) => s.trim());
			} else if (/arc/i.test(appName)) {
				const { stdout } = await execFileAsync("osascript", [
					"-e",
					'tell application "Arc" to get (URL of active tab of front window) & linefeed & (title of active tab of front window)',
				]).catch(() => ({ stdout: "" }));
				[url = "", title = ""] = stdout.split("\n").map((s) => s.trim());
			}

			if (!url) return;
			this.store.syncActiveBrowserPage(appName, url, title || url);
			if (url !== this.lastBrowserUrl) {
				this.lastBrowserUrl = url;
				this.push({
					type: "browser.urlChanged",
					source: "chrome",
					timestamp: Date.now(),
					data: { url, appName, windowTitle: title || appName },
				});
			}
		} catch {
			/* ignore */
		}
	}

	private async pollClipboard() {
		if (process.platform !== "darwin") return;
		if (Date.now() < this.suppressClipboardUntil) return;
		try {
			const { stdout } = await execFileAsync("pbpaste", []);
			const text = stdout.trim();
			if (text && text !== this.lastClipboard) {
				this.lastClipboard = text;
				const ctx = this.store.get();
				this.push({
					type: "clipboard.changed",
					source: "clipboard",
					timestamp: Date.now(),
					data: {
						text,
						appName: ctx.activeApp ?? undefined,
						windowTitle: ctx.activeWindow ?? undefined,
						appPath: ctx.activeAppPath ?? undefined,
						origin: "user",
					},
				});
			}
		} catch {
			/* ignore */
		}
	}

	private push(event: Omit<ContextEvent, "id">) {
		const stored = this.store.push(event);
		if (stored) this.opts.onEvent?.(stored);
	}
}
