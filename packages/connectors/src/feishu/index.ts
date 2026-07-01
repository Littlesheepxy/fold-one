import { extractJsonPayload, probeBinary } from "../cli/binary.js";
import { runShellDetailed } from "../shell.js";

export interface LarkCliProbe {
	available: boolean;
	authed: boolean;
	identity?: string;
	error?: string;
}

export interface LarkMailTriageInput {
	query?: string;
	max?: number;
	mailbox?: string;
}

export interface LarkMailTriageResult {
	ok: boolean;
	count: number;
	summary: string;
	backend: "lark-cli";
}

export async function probeLarkCli(): Promise<LarkCliProbe> {
	if (!(await probeBinary("lark-cli"))) {
		return { available: false, authed: false, error: "lark-cli 未安装" };
	}

	const status = await runShellDetailed("lark-cli", ["auth", "status"], 5000);
	if (status.exitCode !== 0) {
		return {
			available: true,
			authed: false,
			error: "lark-cli 未登录。运行: lark-cli auth login --recommend",
		};
	}

	let identity: string | undefined;
	try {
		const payload = extractJsonPayload(status.stdout) as { identity?: string; note?: string } | null;
		identity = payload?.identity;
		if (payload?.note?.includes("expired")) {
			return {
				available: true,
				authed: false,
				identity,
				error: payload.note,
			};
		}
	} catch {
		identity = undefined;
	}

	return { available: true, authed: true, identity };
}

export async function executeLarkMailTriage(
	input: LarkMailTriageInput,
): Promise<LarkMailTriageResult> {
	const probe = await probeLarkCli();
	if (!probe.available) throw new Error(probe.error ?? "lark-cli 不可用");
	if (!probe.authed) throw new Error(probe.error ?? "lark-cli 未登录");

	const args = [
		"mail",
		"+triage",
		"--format",
		"json",
		"--max",
		String(input.max ?? 20),
		"--mailbox",
		input.mailbox ?? "me",
	];
	if (input.query?.trim()) args.push("--query", input.query.trim());

	const result = await runShellDetailed("lark-cli", args, 30_000);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || "lark-cli mail +triage failed");
	}

	const payload = extractJsonPayload(result.stdout);
	const items = Array.isArray(payload)
		? payload
		: payload && typeof payload === "object" && Array.isArray((payload as { items?: unknown[] }).items)
			? (payload as { items: unknown[] }).items
			: [];

	return {
		ok: true,
		count: items.length,
		summary: JSON.stringify(items, null, 2).slice(0, 4000),
		backend: "lark-cli",
	};
}
