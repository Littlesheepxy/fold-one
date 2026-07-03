import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir, homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import { runAppleScript, runShellDetailed, type ShellResult } from "./shell.js";

const ALLOWED_COMMANDS = new Set([
	"ls",
	"find",
	"wc",
	"head",
	"tail",
	"cat",
	"grep",
	"rg",
	"df",
	"du",
	"which",
	"pbpaste",
	"open",
]);

const DENIED_ARG_PATTERNS = [
	/rm\s+-rf/i,
	/\bsudo\b/i,
	/curl\s+.*\|\s*(sh|bash)/i,
	/(^|\/)\.ssh(\/|$)/,
	/(^|\/)System(\/|$)/,
];

export interface SandboxedShellOptions {
	cwd?: string;
	timeoutMs?: number;
}

function boolEnv(name: string): boolean {
	const value = process.env[name]?.trim().toLowerCase();
	return value === "1" || value === "true" || value === "yes";
}

function ensureScriptAllowed(): void {
	if (!boolEnv("FOLD_ALLOW_SCRIPT_EXECUTION")) {
		throw new Error("脚本执行未开启，请先在 Settings 中启用");
	}
}

function expandHome(path: string): string {
	return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

function resolveCwd(cwd?: string): string | undefined {
	if (!cwd) return undefined;
	const resolved = resolve(expandHome(cwd));
	const allowedRoots = [
		resolve(join(homedir(), "Downloads")),
		resolve(join(homedir(), "Desktop")),
		resolve(join(homedir(), ".fold", "workspace")),
		resolve(process.cwd()),
	];
	if (!allowedRoots.some((root) => resolved === root || resolved.startsWith(`${root}/`))) {
		throw new Error(`脚本 cwd 不在允许范围内: ${cwd}`);
	}
	return resolved;
}

function validateCommand(command: string, args: string[]): void {
	if (command.includes(" ") || command.includes("\0")) {
		throw new Error("脚本命令必须是单个可执行文件名");
	}
	const name = basename(command);
	if (!ALLOWED_COMMANDS.has(name)) {
		throw new Error(`脚本命令未被允许: ${name}`);
	}
	for (const arg of args) {
		if (arg.includes("\0")) throw new Error("脚本参数包含非法字符");
		if (DENIED_ARG_PATTERNS.some((pattern) => pattern.test(arg))) {
			throw new Error("脚本参数被安全策略拒绝");
		}
	}
}

export async function runSandboxedShell(
	command: string,
	args: string[] = [],
	options: SandboxedShellOptions = {},
): Promise<ShellResult> {
	ensureScriptAllowed();
	validateCommand(command, args);
	return runShellDetailed(command, args, options.timeoutMs ?? 10000, resolveCwd(options.cwd));
}

export async function runSandboxedAppleScript(
	script: string,
	timeoutMs = 10000,
): Promise<string> {
	ensureScriptAllowed();
	return runAppleScript(script, timeoutMs);
}

export async function runSandboxedPython(
	input: { code?: string; scriptPath?: string; args?: string[] },
	timeoutMs = 15000,
): Promise<ShellResult> {
	ensureScriptAllowed();
	if (input.scriptPath) {
		return runShellDetailed("python3", [input.scriptPath, ...(input.args ?? [])], timeoutMs);
	}
	if (!input.code?.trim()) throw new Error("os.python: code or scriptPath required");

	const dir = await mkdtemp(join(tmpdir(), "fold-python-"));
	const scriptPath = join(dir, "script.py");
	try {
		await writeFile(scriptPath, input.code, "utf8");
		// 必须 await：直接 return promise 会让 finally 提前删掉临时目录
		return await runShellDetailed("python3", [scriptPath, ...(input.args ?? [])], timeoutMs);
	} finally {
		await rm(dir, { recursive: true, force: true });
	}
}
