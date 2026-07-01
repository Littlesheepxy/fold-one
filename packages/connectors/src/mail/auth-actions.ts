import { spawn } from "node:child_process";

/** Open Terminal and run gog auth add (macOS). */
export function openGogAuthInTerminal(accountHint?: string): void {
	const cmd = accountHint?.includes("@") ? `gog auth add ${accountHint}` : "gog auth add";
	if (process.platform === "darwin") {
		const escaped = cmd.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		spawn(
			"osascript",
			["-e", `tell application "Terminal" to do script "${escaped}"`],
			{ detached: true, stdio: "ignore" },
		).unref();
		return;
	}
	spawn("sh", ["-c", cmd], { detached: true, stdio: "ignore" }).unref();
}

export function openGwsAuthInTerminal(): void {
	const cmd = "gws auth setup";
	if (process.platform === "darwin") {
		const escaped = cmd.replace(/"/g, '\\"');
		spawn(
			"osascript",
			["-e", `tell application "Terminal" to do script "${escaped}"`],
			{ detached: true, stdio: "ignore" },
		).unref();
		return;
	}
	spawn("sh", ["-c", cmd], { detached: true, stdio: "ignore" }).unref();
}
