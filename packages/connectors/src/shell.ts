import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { delimiter, join } from "node:path";

export interface ShellResult {
	stdout: string;
	stderr: string;
	exitCode: number;
	signal?: NodeJS.Signals | null;
}

/**
 * GUI apps on macOS often start with a minimal PATH, even when Homebrew or
 * user-level CLIs are available in Terminal. Resolve common CLI locations
 * without invoking a shell so connector probes and executions behave the same
 * in the packaged app and in development.
 */
function executableSearchDirs(): string[] {
	const home = homedir();
	return [...new Set([
		...(process.env.PATH ?? "").split(delimiter),
		"/opt/homebrew/bin",
		"/opt/homebrew/sbin",
		"/usr/local/bin",
		"/usr/local/sbin",
		"/usr/bin",
		"/bin",
		"/usr/sbin",
		"/sbin",
		join(home, ".local", "bin"),
		join(home, ".npm-global", "bin"),
		join(home, "bin"),
	].filter(Boolean))];
}

async function resolveExecutable(command: string, searchDirs: string[]): Promise<string> {
	if (command.includes("/")) return command;

	// The Codex desktop app ships a complete, authenticated CLI. Prefer it over
	// a stale or partially removed global wrapper so desktop users do not need a
	// second installation just to let Fold call Codex.
	if (command === "codex" && process.platform === "darwin") {
		const home = homedir();
		const bundledCandidates = [
			process.env.FOLD_CODEX_BINARY?.trim(),
			"/Applications/ChatGPT.app/Contents/Resources/codex",
			"/Applications/Codex.app/Contents/Resources/codex",
			join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex"),
			join(home, "Applications", "Codex.app", "Contents", "Resources", "codex"),
		].filter((candidate): candidate is string => Boolean(candidate));
		for (const candidate of bundledCandidates) {
			try {
				await access(candidate, constants.X_OK);
				return candidate;
			} catch {
				// Try the next supported desktop app location.
			}
		}
	}

	for (const dir of searchDirs) {
		const candidate = join(dir, command);
		try {
			await access(candidate, constants.X_OK);
			return candidate;
		} catch {
			// Try the next known executable directory.
		}
	}

	return command;
}

export async function runShellDetailed(
	command: string,
	args: string[],
	timeoutMs = 10000,
	cwd?: string,
	options?: {
		closeStdin?: boolean;
		signal?: AbortSignal;
		stdin?: string;
		/** 进程运行期间逐行触发（按 \n 切分，跨 chunk 的半行会先缓存），用于消费 CLI 的 stream-json 实时输出。 */
		onStdoutLine?: (line: string) => void;
	},
): Promise<ShellResult> {
	const searchDirs = executableSearchDirs();
	const executable = await resolveExecutable(command, searchDirs);
	if (options?.signal?.aborted) {
		return { stdout: "", stderr: `Command canceled: ${command}`, exitCode: 130 };
	}
	return new Promise((resolve) => {
		let stdout = "";
		let stderr = "";
		let settled = false;
		let removeAbortListener = () => {};
		const finish = (result: ShellResult) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			removeAbortListener();
			resolve(result);
		};
		const child = spawn(executable, args, {
			cwd,
			env: { ...process.env, PATH: searchDirs.join(delimiter) },
			// GUI apps may not have a valid inherited stdin descriptor.
			stdio: [options?.stdin !== undefined ? "pipe" : "ignore", "pipe", "pipe"],
		});
		if (options?.stdin !== undefined) {
			child.stdin?.write(options.stdin);
			child.stdin?.end();
		}
		const timer = setTimeout(() => {
			child.kill("SIGTERM");
			finish({ stdout, stderr: stderr || `Command timed out: ${command}`, exitCode: 124 });
		}, timeoutMs);
		if (options?.signal) {
			const onAbort = () => {
				child.kill("SIGTERM");
				finish({ stdout, stderr: stderr || `Command canceled: ${command}`, exitCode: 130 });
			};
			options.signal.addEventListener("abort", onAbort, { once: true });
			removeAbortListener = () => options.signal?.removeEventListener("abort", onAbort);
		}
		const append = (current: string, chunk: Buffer): string => {
			const next = current + chunk.toString("utf8");
			return next.length > 10 * 1024 * 1024 ? next.slice(0, 10 * 1024 * 1024) : next;
		};
		let lineBuffer = "";
		child.stdout?.on("data", (chunk: Buffer) => {
			stdout = append(stdout, chunk);
			if (!options?.onStdoutLine) return;
			lineBuffer += chunk.toString("utf8");
			const parts = lineBuffer.split("\n");
			lineBuffer = parts.pop() ?? "";
			for (const part of parts) options.onStdoutLine(part.replace(/\r$/, ""));
		});
		child.stderr?.on("data", (chunk: Buffer) => {
			stderr = append(stderr, chunk);
		});
		child.once("error", (error: NodeJS.ErrnoException) => {
			finish({ stdout, stderr: stderr || error.message, exitCode: 124 });
		});
		child.once("close", (code, signal) => {
			if (options?.onStdoutLine && lineBuffer) options.onStdoutLine(lineBuffer.replace(/\r$/, ""));
			finish({ stdout, stderr, exitCode: code ?? 124, signal });
		});
	});
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
