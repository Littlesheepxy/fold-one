import { execFile } from "node:child_process";
import { homedir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import chokidar, { type FSWatcher } from "chokidar";
import type { ContextEvent } from "./types.js";
import { ContextStore } from "./store.js";

const execFileAsync = promisify(execFile);

export interface ContextEngineOptions {
	downloadsDir?: string;
	onEvent?: (event: ContextEvent) => void;
}

export class ContextEngine {
	private store = new ContextStore();
	private watchers: FSWatcher[] = [];
	private clipboardTimer: ReturnType<typeof setInterval> | null = null;
	private appTimer: ReturnType<typeof setInterval> | null = null;
	private lastClipboard = "";
	private lastBrowserUrl = "";

	constructor(private opts: ContextEngineOptions = {}) {}

	getLiveContext() {
		return this.store.get();
	}

	/** Test / dev: inject a context event */
	pushEvent(event: Omit<ContextEvent, "id">) {
		this.push(event);
	}

	start() {
		const downloads = this.opts.downloadsDir ?? join(homedir(), "Downloads");

		const watcher = chokidar.watch(downloads, {
			ignored: /(^|[/\\])\../,
			persistent: true,
			ignoreInitial: true,
			depth: 0,
			awaitWriteFinish: { stabilityThreshold: 500, pollInterval: 100 },
		});

		watcher.on("add", (filePath) => {
			this.push({
				type: "file.created",
				source: "finder",
				timestamp: Date.now(),
				data: { filePath, appName: "Finder" },
			});
		});

		this.watchers.push(watcher);

		this.appTimer = setInterval(() => void this.pollActiveApp(), 2000);
		this.clipboardTimer = setInterval(() => void this.pollClipboard(), 1500);
		void this.pollActiveApp();
	}

	stop() {
		for (const w of this.watchers) void w.close();
		this.watchers = [];
		if (this.appTimer) clearInterval(this.appTimer);
		if (this.clipboardTimer) clearInterval(this.clipboardTimer);
	}

	private async pollActiveApp() {
		if (process.platform !== "darwin") return;
		try {
			const { stdout } = await execFileAsync("osascript", [
				"-e",
				'tell application "System Events" to get name of first application process whose frontmost is true',
			]);
			const appName = stdout.trim();
			const { stdout: titleOut } = await execFileAsync("osascript", [
				"-e",
				'tell application "System Events" to get name of window 1 of (first application process whose frontmost is true)',
			]).catch(() => ({ stdout: "" }));
			this.push({
				type: "app.active",
				source: "system",
				timestamp: Date.now(),
				data: { appName, windowTitle: titleOut.trim() || undefined },
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
			if (/chrome/i.test(appName)) {
				const { stdout } = await execFileAsync("osascript", [
					"-e",
					'tell application "Google Chrome" to get URL of active tab of front window',
				]);
				url = stdout.trim();
			} else if (/arc/i.test(appName)) {
				const { stdout } = await execFileAsync("osascript", [
					"-e",
					'tell application "Arc" to get URL of active tab of front window',
				]).catch(() => ({ stdout: "" }));
				url = stdout.trim();
			}

			if (url && url !== this.lastBrowserUrl) {
				this.lastBrowserUrl = url;
				this.push({
					type: "browser.urlChanged",
					source: "chrome",
					timestamp: Date.now(),
					data: { url, appName, windowTitle: appName },
				});
			}
		} catch {
			/* ignore */
		}
	}

	private async pollClipboard() {
		if (process.platform !== "darwin") return;
		try {
			const { stdout } = await execFileAsync("pbpaste", []);
			const text = stdout.trim();
			if (text && text !== this.lastClipboard) {
				this.lastClipboard = text;
				this.push({
					type: "clipboard.changed",
					source: "clipboard",
					timestamp: Date.now(),
					data: { text },
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
