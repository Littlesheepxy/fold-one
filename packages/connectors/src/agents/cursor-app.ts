import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { runShellDetailed } from "../shell.js";

const CURSOR_CLI_URL = "https://docs.cursor.com/en/cli/installation";

export function isCursorAppInstalled(): boolean {
	const home = homedir();
	return [
		"/Applications/Cursor.app",
		join(home, "Applications", "Cursor.app"),
	].some((path) => existsSync(path));
}

export function startCursorBrowserLogin(): { opened: boolean } {
	// Cursor's supported login flow opens the default browser itself.
	void runShellDetailed("agent", ["login"], 10 * 60_000);
	return { opened: true };
}

export function openCursorAgentInstall(): { opened: boolean; url: string } {
	if (process.platform === "win32") {
		spawn("cmd", ["/c", "start", "", CURSOR_CLI_URL], {
			detached: true,
			stdio: "ignore",
		}).unref();
	} else {
		spawn("open", [CURSOR_CLI_URL], { detached: true, stdio: "ignore" }).unref();
	}
	return { opened: false, url: CURSOR_CLI_URL };
}
