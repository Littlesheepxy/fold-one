import { mkdir, rm, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { runAppleScript, runShellDetailed } from "../shell.js";

export type ScreenshotTarget = "screen" | "frontmost";

export interface ScreenshotResult {
	path: string;
	target: ScreenshotTarget;
	bytes: number;
}

export interface ScreenCaptureProbe {
	available: boolean;
	error?: string;
}

function screenshotDir(): string {
	return join(homedir(), ".fold", "screenshots");
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
		// -1728 / permission errors: frontmost process has no accessible window
		return null;
	}
}

export async function captureScreenshot(
	options: { target?: ScreenshotTarget; outPath?: string } = {},
): Promise<ScreenshotResult> {
	if (process.platform !== "darwin") {
		throw new Error("os.screenshot 仅支持 macOS");
	}

	const target = options.target ?? "frontmost";
	const dir = screenshotDir();
	await mkdir(dir, { recursive: true });
	const path = options.outPath ?? join(dir, `fold-${Date.now()}.png`);

	const args = ["-x", path];
	if (target === "frontmost") {
		const winId = await getFrontmostWindowId();
		if (winId !== null) {
			args.unshift(`-l${winId}`);
		}
		// winId === null: frontmost process has no accessible window (error
		// -1728). Fall through to a full-screen capture so the call still
		// succeeds instead of passing an invalid "-lnull" flag.
	}

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

	return { path, target, bytes: fileStat.size };
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
