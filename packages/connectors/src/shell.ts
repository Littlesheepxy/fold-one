import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ShellResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	signal?: NodeJS.Signals | null;
}

function toText(value: unknown): string {
	if (Buffer.isBuffer(value)) return value.toString("utf8");
	if (typeof value === "string") return value;
	return "";
}

export async function runShellDetailed(
	command: string,
	args: string[],
	timeoutMs = 10000,
	cwd?: string,
	options?: { closeStdin?: boolean },
): Promise<ShellResult> {
	try {
		const { stdout, stderr } = await execFileAsync(command, args, {
			timeout: timeoutMs,
			maxBuffer: 10 * 1024 * 1024,
			cwd,
			...(options?.closeStdin ? { stdio: ["ignore", "pipe", "pipe"] as const } : {}),
		});
		return { stdout, stderr, exitCode: 0 };
	} catch (error) {
		const e = error as {
			stdout?: string | Buffer;
			stderr?: string | Buffer;
			code?: number | string;
			signal?: NodeJS.Signals | null;
		};
		const exitCode = typeof e.code === "number" ? e.code : 124;
		return {
			stdout: toText(e.stdout),
			stderr: toText(e.stderr),
			exitCode,
			signal: e.signal,
		};
	}
}

export async function runShell(command: string, args: string[], timeoutMs = 10000): Promise<string> {
	const result = await runShellDetailed(command, args, timeoutMs);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || `Command failed: ${command}`);
	}
	return result.stdout;
}

export async function runAppleScript(script: string, timeoutMs = 10000): Promise<string> {
	return runShell("osascript", ["-e", script], timeoutMs);
}

export async function runPython(scriptPath: string, args: string[], timeoutMs = 15000): Promise<string> {
	return runShell("python3", [scriptPath, ...args], timeoutMs);
}
