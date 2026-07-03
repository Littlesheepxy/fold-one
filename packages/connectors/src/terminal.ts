import { spawn } from "node:child_process";

/** Open macOS Terminal (or sh on Linux) and run a command. */
export function openInTerminal(command: string): void {
	if (process.platform === "darwin") {
		const escaped = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const script = [
			'tell application "Terminal"',
			"  activate",
			`  do script "${escaped}"`,
			"end tell",
		].join("\n");
		const child = spawn("osascript", ["-e", script], {
			detached: true,
			stdio: ["ignore", "ignore", "pipe"],
		});
		child.stderr?.on("data", (chunk) => {
			console.error("[fold] openInTerminal:", String(chunk).trim());
		});
		child.unref();
		return;
	}
	spawn("sh", ["-c", command], { detached: true, stdio: "ignore" }).unref();
}
