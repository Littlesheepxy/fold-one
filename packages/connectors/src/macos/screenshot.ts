import { mkdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { runAppleScript, runShellDetailed } from "../shell.js";

export type ScreenshotTarget = "screen" | "frontmost" | "app";

export interface ScreenshotResult {
	path: string;
	target: ScreenshotTarget;
	bytes: number;
	windowId?: number | null;
}

export interface ScreenCaptureProbe {
	available: boolean;
	error?: string;
}

function screenshotDir(): string {
	return join(homedir(), ".fold", "screenshots");
}

function escapeAppleScript(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** Common process name aliases for Chinese chat apps. */
function appNameCandidates(appName: string): string[] {
	const raw = appName.trim();
	if (!raw) return [];
	const lower = raw.toLowerCase();
	const out = new Set<string>([raw]);
	if (/微信|wechat|weixin/i.test(raw) || lower === "wechat") {
		out.add("WeChat");
		out.add("微信");
	}
	if (/飞书|feishu|lark/i.test(raw) || lower === "feishu" || lower === "lark") {
		out.add("Feishu");
		out.add("Lark");
		out.add("飞书");
	}
	if (/钉钉|dingtalk/i.test(raw)) {
		out.add("DingTalk");
		out.add("钉钉");
	}
	return [...out];
}

async function getFrontmostWindowId(): Promise<number | null> {
	try {
		const out = await runAppleScript(
			'tell application "System Events" to get id of window 1 of (first application process whose frontmost is true)',
		);
		const id = Number.parseInt(out.trim(), 10);
		if (!Number.isFinite(id)) return null;
		return id;
	} catch {
		return null;
	}
}

async function getAppWindowId(appName: string): Promise<number | null> {
	const names = appNameCandidates(appName);
	if (!names.length) return null;
	const list = names.map((n) => `"${escapeAppleScript(n)}"`).join(", ");
	try {
		const out = await runAppleScript(`
tell application "System Events"
  set wanted to {${list}}
  repeat with p in (every application process whose visible is true)
    set pn to name of p as text
    if pn is in wanted then
      try
        return id of window 1 of p
      end try
    end if
  end repeat
end tell
return ""
`);
		const id = Number.parseInt(out.trim(), 10);
		if (!Number.isFinite(id)) return null;
		return id;
	} catch {
		return null;
	}
}

export async function captureScreenshot(
	options: {
		target?: ScreenshotTarget;
		appName?: string | null;
		outPath?: string;
	} = {},
): Promise<ScreenshotResult> {
	if (process.platform !== "darwin") {
		throw new Error("os.screenshot 仅支持 macOS");
	}

	const target = options.target ?? (options.appName ? "app" : "frontmost");
	const dir = screenshotDir();
	await mkdir(dir, { recursive: true });
	const path = options.outPath ?? join(dir, `fold-${Date.now()}.png`);

	const args = ["-x", path];
	let windowId: number | null = null;
	if (target === "app" && options.appName?.trim()) {
		windowId = await getAppWindowId(options.appName);
	} else if (target === "frontmost") {
		windowId = await getFrontmostWindowId();
	}
	if (windowId !== null) {
		args.unshift(`-l${windowId}`);
	}
	// windowId === null: fall through to full primary-display capture.
	// Callers that need a specific app should prefer early capture while that app is frontmost.

	const result = await runShellDetailed("screencapture", args, 15_000);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || "screencapture 失败");
	}

	const fileStat = await stat(path);
	if (fileStat.size < 512) {
		throw new Error(
			"截屏文件为空，请在 系统设置 → 隐私与安全性 → 屏幕录制 中授权 Fold/Electron/Cursor 终端",
		);
	}

	return { path, target, bytes: fileStat.size, windowId };
}

/** Probe screen-recording permission with a tiny throwaway capture. */
export async function probeScreenCapture(): Promise<ScreenCaptureProbe> {
	if (process.platform !== "darwin") {
		return { available: false, error: "仅支持 macOS" };
	}

	const probePath = join(screenshotDir(), `probe-${Date.now()}.png`);
	try {
		const shot = await captureScreenshot({ target: "screen", outPath: probePath });
		if (shot.bytes < 1024) {
			return {
				available: false,
				error: "屏幕录制权限未生效或截图为空",
			};
		}
		return { available: true };
	} catch (error) {
		return { available: false, error: (error as Error).message };
	} finally {
		await rm(probePath, { force: true }).catch(() => {});
	}
}
