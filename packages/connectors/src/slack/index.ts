import { extractJsonPayload, probeBinary } from "../cli/binary.js";
import { runShellDetailed } from "../shell.js";

export type SlackCliBackend = "slack-cli" | "slk";

export interface SlackCliProbe {
	available: boolean;
	backend?: SlackCliBackend;
	error?: string;
}

export interface SlackUnreadResult {
	ok: boolean;
	count: number;
	summary: string;
	backend: SlackCliBackend;
}

export async function probeSlackCli(): Promise<SlackCliProbe> {
	if (await probeBinary("slack-cli")) {
		return { available: true, backend: "slack-cli" };
	}

	if (await probeBinary("slk")) {
		const auth = await runShellDetailed("slk", ["auth"], 5000);
		if (auth.exitCode === 0 && !/not authenticated|failed/i.test(auth.stdout + auth.stderr)) {
			return { available: true, backend: "slk" };
		}
		return {
			available: true,
			backend: "slk",
			error: "slk 已安装但 Slack 桌面未登录",
		};
	}

	return { available: false, error: "未找到 slack-cli 或 slk" };
}

function countUnreadPayload(payload: unknown): number {
	if (Array.isArray(payload)) return payload.length;
	if (payload && typeof payload === "object") {
		const record = payload as { unreads?: unknown[]; messages?: unknown[]; channels?: unknown[] };
		if (Array.isArray(record.unreads)) return record.unreads.length;
		if (Array.isArray(record.messages)) return record.messages.length;
		if (Array.isArray(record.channels)) {
			return record.channels.reduce<number>((sum, ch) => {
				const unread = (ch as { unread_count?: number }).unread_count ?? 0;
				return sum + unread;
			}, 0);
		}
	}
	return 0;
}

export async function executeSlackUnread(limit = 50, probe?: SlackCliProbe): Promise<SlackUnreadResult> {
	const resolved = probe ?? (await probeSlackCli());
	if (!resolved.available || !resolved.backend) {
		throw new Error(resolved.error ?? "Slack CLI 不可用");
	}

	if (resolved.backend === "slack-cli") {
		const result = await runShellDetailed(
			"slack-cli",
			["unread", "--limit", String(limit), "-o", "json"],
			30_000,
		);
		if (result.exitCode !== 0) {
			throw new Error(result.stderr.trim() || "slack-cli unread failed");
		}
		const payload = extractJsonPayload(result.stdout);
		return {
			ok: true,
			count: countUnreadPayload(payload),
			summary: JSON.stringify(payload, null, 2).slice(0, 4000),
			backend: "slack-cli",
		};
	}

	const result = await runShellDetailed("slk", ["unread"], 30_000);
	if (result.exitCode !== 0) {
		throw new Error(result.stderr.trim() || "slk unread failed");
	}

	return {
		ok: true,
		count: result.stdout.split("\n").filter((line) => line.trim()).length,
		summary: result.stdout.trim().slice(0, 4000),
		backend: "slk",
	};
}
