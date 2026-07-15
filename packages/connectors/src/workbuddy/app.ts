import { execSync, spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const WORKBUDDY_DOWNLOAD_URL = "https://www.codebuddy.ai/workbuddy";

function candidateAppPaths(): string[] {
	const home = homedir();
	return [
		"/Applications/WorkBuddy.app",
		join(home, "Applications/WorkBuddy.app"),
	];
}

function discoverWorkBuddyAppPath(): string | null {
	for (const path of candidateAppPaths()) {
		if (existsSync(path)) return path;
	}
	if (process.platform !== "darwin") return null;
	try {
		const found = execSync(
			"mdfind \"kMDItemCFBundleIdentifier == 'com.tencent.workbuddy'\" | head -1",
			{ encoding: "utf8", maxBuffer: 4096 },
		).trim();
		return found && existsSync(found) ? found : null;
	} catch {
		return null;
	}
}

/** Open WorkBuddy desktop app, or download page if not installed. */
export function openWorkBuddyApp(): { opened: boolean; url?: string } {
	if (process.platform === "darwin") {
		if (discoverWorkBuddyAppPath()) {
			spawn("open", ["-a", "WorkBuddy"], { detached: true, stdio: "ignore" }).unref();
			return { opened: true };
		}
		spawn("open", [WORKBUDDY_DOWNLOAD_URL], { detached: true, stdio: "ignore" }).unref();
		return { opened: false, url: WORKBUDDY_DOWNLOAD_URL };
	}
	if (process.platform === "win32") {
		spawn("cmd", ["/c", "start", "", WORKBUDDY_DOWNLOAD_URL], {
			detached: true,
			stdio: "ignore",
		}).unref();
		return { opened: false, url: WORKBUDDY_DOWNLOAD_URL };
	}
	spawn("open", [WORKBUDDY_DOWNLOAD_URL], { detached: true, stdio: "ignore" }).unref();
	return { opened: false, url: WORKBUDDY_DOWNLOAD_URL };
}
