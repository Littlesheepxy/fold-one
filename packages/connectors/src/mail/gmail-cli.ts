import { extractJsonPayload, probeBinary } from "../cli/binary.js";
import { runShellDetailed } from "../shell.js";
import type { MailCountUnreadResult } from "./types.js";

export type GmailCliBackend = "gog" | "gws";

export interface GmailCliProbe {
	available: boolean;
	backend?: GmailCliBackend;
	account?: string;
	error?: string;
}

function resolveGogAccount(): string | undefined {
	return process.env.GOG_ACCOUNT?.trim() || process.env.FOLD_GOG_ACCOUNT?.trim() || undefined;
}

async function probeGogAuth(): Promise<{ authed: boolean; account?: string }> {
	const list = await runShellDetailed("gog", ["auth", "list"], 5000);
	if (list.exitCode !== 0 || /No tokens stored/i.test(list.stdout)) {
		return { authed: false };
	}
	const account = resolveGogAccount();
	if (account) return { authed: true, account };

	const match = list.stdout.match(/([^\s]+@[^\s]+)/);
	return { authed: true, account: match?.[1] };
}

async function probeGwsAuth(): Promise<boolean> {
	const status = await runShellDetailed("gws", ["auth", "status"], 5000);
	return status.exitCode === 0 && !/not authenticated|not logged in/i.test(status.stdout + status.stderr);
}

export async function probeGmailCli(): Promise<GmailCliProbe> {
	if (await probeBinary("gog")) {
		const auth = await probeGogAuth();
		if (auth.authed) {
			return { available: true, backend: "gog", account: auth.account };
		}
	}

	if (await probeBinary("gws")) {
		if (await probeGwsAuth()) {
			return { available: true, backend: "gws" };
		}
	}

	if (await probeBinary("gog")) {
		return {
			available: false,
			backend: "gog",
			error: "gog 已安装但未登录。运行: gog auth add <email>",
		};
	}
	if (await probeBinary("gws")) {
		return {
			available: false,
			backend: "gws",
			error: "gws 已安装但未认证。运行: gws auth setup",
		};
	}

	return { available: false, error: "未找到 gog 或 gws CLI" };
}

async function countUnreadViaGog(account?: string): Promise<number> {
	const args = ["--json"];
	if (account) args.push("--account", account);
	args.push("gmail", "search", "is:unread", "--max", "500");

	const result = await runShellDetailed("gog", args, 30_000);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || "gog gmail search failed");
	}

	const payload = extractJsonPayload(result.stdout);
	if (Array.isArray(payload)) return payload.length;
	if (payload && typeof payload === "object") {
		const threads = (payload as { threads?: unknown[] }).threads;
		if (Array.isArray(threads)) return threads.length;
	}
	throw new Error("gog gmail search: unexpected JSON shape");
}

async function countUnreadViaGws(): Promise<number> {
	const result = await runShellDetailed(
		"gws",
		["gmail", "+triage", "--format", "json", "--max", "500"],
		30_000,
	);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || result.stdout.trim() || "gws gmail +triage failed");
	}

	const payload = extractJsonPayload(result.stdout);
	if (Array.isArray(payload)) return payload.length;
	if (payload && typeof payload === "object") {
		const messages = (payload as { messages?: unknown[] }).messages;
		if (Array.isArray(messages)) return messages.length;
	}
	throw new Error("gws gmail +triage: unexpected JSON shape");
}

export async function countGmailCliUnread(probe?: GmailCliProbe): Promise<MailCountUnreadResult> {
	const resolved = probe ?? (await probeGmailCli());
	if (!resolved.available || !resolved.backend) {
		throw new Error(resolved.error ?? "Gmail CLI 不可用");
	}

	const count =
		resolved.backend === "gog"
			? await countUnreadViaGog(resolved.account)
			: await countUnreadViaGws();

	return {
		provider: "gmail-cli",
		count,
		backend: resolved.backend,
	};
}
