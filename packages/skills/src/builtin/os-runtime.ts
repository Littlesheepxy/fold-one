import {
	runSandboxedAppleScript,
	runSandboxedPython,
	runSandboxedShell,
} from "@fold/connectors";
import type { SkillContext } from "../types.js";

function stringArray(value: unknown): string[] {
	if (!Array.isArray(value)) return [];
	return value.map((item) => String(item));
}

export async function osShell(args: Record<string, unknown>, ctx: SkillContext) {
	const command = String(args.command ?? "");
	if (!command) throw new Error("os.shell: command required");
	const shellArgs = stringArray(args.args);
	const cwd = typeof args.cwd === "string" ? args.cwd : undefined;

	ctx.emit({ type: "progress", message: `Running ${command}` });
	const result = await runSandboxedShell(command, shellArgs, { cwd });
	return { command, args: shellArgs, cwd, ...result };
}

export async function osAppleScript(args: Record<string, unknown>, ctx: SkillContext) {
	const script = String(args.script ?? "");
	if (!script.trim()) throw new Error("os.applescript: script required");

	ctx.emit({ type: "progress", message: "Running AppleScript" });
	const output = await runSandboxedAppleScript(script);
	return { output };
}

export async function osPython(args: Record<string, unknown>, ctx: SkillContext) {
	const code = typeof args.code === "string" ? args.code : undefined;
	const scriptPath = typeof args.scriptPath === "string" ? args.scriptPath : undefined;
	const pyArgs = stringArray(args.args);

	ctx.emit({ type: "progress", message: "Running Python" });
	const result = await runSandboxedPython({ code, scriptPath, args: pyArgs });
	return { args: pyArgs, ...result };
}
