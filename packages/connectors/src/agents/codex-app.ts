import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const CODEX_DOWNLOAD_URL = "https://openai.com/codex/get-started/";

function candidateAppPaths(): string[] {
	const home = homedir();
	return [
		"/Applications/ChatGPT.app",
		"/Applications/Codex.app",
		join(home, "Applications", "ChatGPT.app"),
		join(home, "Applications", "Codex.app"),
	];
}

export function discoverCodexAppPath(): string | null {
	return candidateAppPaths().find((path) => existsSync(path)) ?? null;
}

export function isCodexAppInstalled(): boolean {
	return Boolean(discoverCodexAppPath());
}

/** Open the installed Codex/ChatGPT app, or its official download page. */
export function openCodexApp(): { opened: boolean; url?: string } {
	const appPath = discoverCodexAppPath();
	if (process.platform === "darwin" && appPath) {
		spawn("open", [appPath], { detached: true, stdio: "ignore" }).unref();
		return { opened: true };
	}
	if (process.platform === "win32") {
		spawn("cmd", ["/c", "start", "", CODEX_DOWNLOAD_URL], {
			detached: true,
			stdio: "ignore",
		}).unref();
	} else {
		spawn("open", [CODEX_DOWNLOAD_URL], { detached: true, stdio: "ignore" }).unref();
	}
	return { opened: false, url: CODEX_DOWNLOAD_URL };
}
