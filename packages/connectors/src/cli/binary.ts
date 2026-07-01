import { runShellDetailed } from "../shell.js";

/** Check whether a CLI binary is on PATH. */
export async function probeBinary(name: string, timeoutMs = 3000): Promise<boolean> {
	const result = await runShellDetailed(name, ["--version"], timeoutMs);
	if (result.exitCode === 0) return true;
	const help = await runShellDetailed(name, ["--help"], timeoutMs);
	return help.exitCode === 0;
}

export function extractJsonPayload(stdout: string): unknown {
	const trimmed = stdout.trim();
	if (!trimmed) return null;
	if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
		try {
			return JSON.parse(trimmed) as unknown;
		} catch {
			// fall through
		}
	}
	const start = trimmed.search(/[{[]/);
	const end = Math.max(trimmed.lastIndexOf("}"), trimmed.lastIndexOf("]"));
	if (start >= 0 && end > start) {
		try {
			return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
		} catch {
			return trimmed;
		}
	}
	return trimmed;
}
