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

/**
 * 找目标 App 的窗口号。AX（window 1）优先；AX 拿不到窗口（微信/飞书等自绘 UI）时，
 * 退到按 PID 查 CGWindowList —— 用 PID 而不是进程名匹配，因为 CGWindowList 的
 * kCGWindowOwnerName 在中文系统下是本地化名（"微信""飞书"），跟 AX 进程名不是一回事，
 * PID 是数字，天然跨语言、不用为每个 App 维护中英文别名表。
 */
async function getAppWindowId(appName: string): Promise<number | null> {
	const name = appName.trim();
	if (!name) return null;
	try {
		const out = await runAppleScript(`
tell application "System Events"
  set procs to (every application process whose visible is true and name is "${escapeAppleScript(name)}")
  if (count of procs) > 0 then
    set p to item 1 of procs
    try
      return "id:" & (id of window 1 of p)
    end try
    try
      return "pid:" & (unix id of p)
    end try
  end if
end tell
return ""
`);
		const trimmed = out.trim();
		if (trimmed.startsWith("id:")) {
			const id = Number.parseInt(trimmed.slice(3), 10);
			if (Number.isFinite(id)) return id;
		} else if (trimmed.startsWith("pid:")) {
			const pid = Number.parseInt(trimmed.slice(4), 10);
			if (Number.isFinite(pid)) return getWindowIdViaCGWindowList(pid);
		}
	} catch {
		/* 进程不存在或 System Events 查询失败 */
	}
	return null;
}

/** 用 CGWindowList 按 PID 查窗口号（覆盖 WeChat/Feishu 等无 AX 窗口的 App）。
 *  取面积最大的 layer-0 窗口（主窗口）；不加 onScreenOnly，否则后台 App 查不到。 */
async function getWindowIdViaCGWindowList(pid: number): Promise<number | null> {
	const swift = `
import CoreGraphics
import Foundation
let pid: Int32 = ${pid}
let list = CGWindowListCopyWindowInfo([.excludeDesktopElements], kCGNullWindowID) as? [[String: Any]] ?? []
var best: (num: Int, area: CGFloat)? = nil
for w in list {
  let ownerPid = w[kCGWindowOwnerPID as String] as? Int32 ?? -1
  let layer = w[kCGWindowLayer as String] as? Int ?? -1
  let bounds = w[kCGWindowBounds as String] as? [String: CGFloat] ?? [:]
  let width = bounds["Width"] ?? 0
  let height = bounds["Height"] ?? 0
  if ownerPid == pid && layer == 0 && width > 200 && height > 200 {
    if let num = w[kCGWindowNumber as String] as? Int {
      let area = width * height
      if best == nil || area > best!.area { best = (num, area) }
    }
  }
}
if let b = best { print(b.num) }
`;
	try {
		const result = await runShellDetailed("swift", ["-"], 15_000, undefined, { stdin: swift });
		const id = Number.parseInt(result.stdout.trim().split("\n")[0] ?? "", 10);
		return Number.isFinite(id) ? id : null;
	} catch {
		return null;
	}
}

export function buildScreencaptureArgs(
	path: string,
	windowId: number | null,
	screenRect?: { x: number; y: number; width: number; height: number },
): string[] {
	const args = ["-x", path];
	if (windowId !== null) {
		args.unshift(`-l${windowId}`);
	} else if (screenRect) {
		const { x, y, width, height } = screenRect;
		args.unshift(`-R${x},${y},${width},${height}`);
	}
	// windowId === null && !screenRect: fall through to full primary-display capture.
	return args;
}

export async function captureScreenshot(
	options: {
		target?: ScreenshotTarget;
		appName?: string | null;
		outPath?: string;
		/** 多屏时截「用户鼠标当前所在」的那块屏而非固定主屏，仅在退化为全屏截图时生效。 */
		screenRect?: { x: number; y: number; width: number; height: number };
	} = {},
): Promise<ScreenshotResult> {
	if (process.platform !== "darwin") {
		throw new Error("os.screenshot 仅支持 macOS");
	}

	const target = options.target ?? (options.appName ? "app" : "frontmost");
	const dir = screenshotDir();
	await mkdir(dir, { recursive: true });
	const path = options.outPath ?? join(dir, `fold-${Date.now()}.png`);

	let windowId: number | null = null;
	if (target === "app" && options.appName?.trim()) {
		windowId = await getAppWindowId(options.appName);
	} else if (target === "frontmost") {
		windowId = await getFrontmostWindowId();
	}
	// windowId === null && !screenRect: fall through to full primary-display capture.
	// Callers that need a specific app should prefer early capture while that app is frontmost.
	const args = buildScreencaptureArgs(path, windowId, options.screenRect);

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
