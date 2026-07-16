/**
 * IM 真实读写 E2E：飞书自聊、钉钉待办、企微自聊。
 * 跳过未安装/未登录的渠道；任一渠道 FAIL 则 exit 1。
 *
 * 用法：
 *   pnpm exec tsx scripts/verify-im-e2e.ts
 *   pnpm exec tsx scripts/verify-im-e2e.ts --channel=feishu
 */
import { probeOfficeChannels, runOfficeCli } from "@fold/connectors";

const only = process.argv.find((a) => a.startsWith("--channel="))?.slice("--channel=".length);

type StepResult = {
	channel: string;
	step: string;
	ok: boolean;
	ms: number;
	detail: string;
};

const results: StepResult[] = [];

function stamp(): string {
	return `fold-e2e-${Date.now()}`;
}

function parseJson(raw: string): unknown {
	try {
		return JSON.parse(raw);
	} catch {
		const start = raw.indexOf("{");
		const end = raw.lastIndexOf("}");
		if (start >= 0 && end > start) {
			try {
				return JSON.parse(raw.slice(start, end + 1));
			} catch {
				return null;
			}
		}
		return null;
	}
}

function dig(obj: unknown, path: string[]): unknown {
	let cur: unknown = obj;
	for (const key of path) {
		if (!cur || typeof cur !== "object") return undefined;
		cur = (cur as Record<string, unknown>)[key];
	}
	return cur;
}

async function step(
	channel: string,
	name: string,
	fn: () => Promise<{ ok: boolean; detail: string }>,
): Promise<boolean> {
	const t0 = Date.now();
	try {
		const r = await fn();
		results.push({ channel, step: name, ok: r.ok, ms: Date.now() - t0, detail: r.detail });
		console.log(`${r.ok ? "PASS" : "FAIL"}  ${channel.padEnd(8)} ${name.padEnd(20)} ${Date.now() - t0}ms  ${r.detail}`);
		return r.ok;
	} catch (err) {
		results.push({
			channel,
			step: name,
			ok: false,
			ms: Date.now() - t0,
			detail: (err as Error).message,
		});
		console.log(`FAIL  ${channel.padEnd(8)} ${name.padEnd(20)} ${Date.now() - t0}ms  ${(err as Error).message}`);
		return false;
	}
}

async function verifyFeishu(): Promise<boolean> {
	let openId = "";
	const marker = stamp();
	const okId = await step("feishu", "get-self", async () => {
		const r = await runOfficeCli("feishu", ["contact", "+get-user", "--as", "user", "--format", "json"]);
		const j = parseJson(r.stdout);
		openId = String(dig(j, ["data", "user", "open_id"]) ?? dig(j, ["user", "open_id"]) ?? "");
		return {
			ok: r.ok && Boolean(openId),
			detail: openId ? `open_id=${openId.slice(0, 12)}…` : r.stderr || r.stdout.slice(0, 120),
		};
	});
	if (!okId) return false;

	const okSend = await step("feishu", "send-self", async () => {
		const r = await runOfficeCli("feishu", [
			"im",
			"+messages-send",
			"--as",
			"user",
			"--user-id",
			openId,
			"--text",
			marker,
			"--format",
			"json",
		]);
		return { ok: r.ok, detail: r.ok ? marker : r.stderr || r.stdout.slice(0, 160) };
	});
	if (!okSend) return false;

	return step("feishu", "read-back", async () => {
		const start = new Date(Date.now() - 5 * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z");
		const r = await runOfficeCli("feishu", [
			"im",
			"+chat-messages-list",
			"--as",
			"user",
			"--user-id",
			openId,
			"--start",
			start,
			"--format",
			"json",
		]);
		const hit = r.stdout.includes(marker);
		return {
			ok: r.ok && hit,
			detail: hit ? `found ${marker}` : r.stderr || "marker not in recent messages",
		};
	});
}

async function verifyDingtalk(): Promise<boolean> {
	let userId = "";
	let taskId = "";
	const title = stamp();

	const okSelf = await step("dingtalk", "get-self", async () => {
		const r = await runOfficeCli("dingtalk", ["contact", "user", "get-self", "--format", "json"]);
		const j = parseJson(r.stdout);
		userId = String(
			dig(j, ["result", "userId"]) ??
				dig(j, ["data", "userId"]) ??
				dig(j, ["userId"]) ??
				"",
		);
		return {
			ok: r.ok && Boolean(userId),
			detail: userId ? `userId=${userId}` : r.stderr || r.stdout.slice(0, 120),
		};
	});
	if (!okSelf) return false;

	const okCreate = await step("dingtalk", "todo-create", async () => {
		const r = await runOfficeCli("dingtalk", [
			"todo",
			"task",
			"create",
			"--title",
			title,
			"--executors",
			userId,
			"--format",
			"json",
		]);
		const j = parseJson(r.stdout);
		taskId = String(
			dig(j, ["result", "taskId"]) ?? dig(j, ["data", "taskId"]) ?? dig(j, ["taskId"]) ?? "",
		);
		return {
			ok: r.ok && Boolean(taskId),
			detail: taskId ? `taskId=${taskId}` : r.stderr || r.stdout.slice(0, 160),
		};
	});
	if (!okCreate) return false;

	return step("dingtalk", "todo-delete", async () => {
		const r = await runOfficeCli("dingtalk", [
			"todo",
			"task",
			"delete",
			"--task-id",
			taskId,
			"--yes",
			"--format",
			"json",
		]);
		return { ok: r.ok, detail: r.ok ? `deleted ${taskId}` : r.stderr || r.stdout.slice(0, 160) };
	});
}

async function verifyWecom(): Promise<boolean> {
	let userId = "";
	const marker = stamp();

	const okSelf = await step("wecom", "get-userlist", async () => {
		const r = await runOfficeCli("wecom", ["contact", "get_userlist", "{}"]);
		const j = parseJson(r.stdout) as { useridlist?: string[]; userlist?: Array<{ userid?: string }> } | null;
		userId =
			j?.useridlist?.[0] ??
			j?.userlist?.[0]?.userid ??
			String(dig(j, ["data", "useridlist", "0"]) ?? "");
		return {
			ok: r.ok && Boolean(userId),
			detail: userId ? `userid=${userId}` : r.stderr || r.stdout.slice(0, 160),
		};
	});
	if (!okSelf) return false;

	const okSend = await step("wecom", "send-self", async () => {
		const payload = JSON.stringify({
			chat_type: 1,
			chatid: userId,
			msgtype: "text",
			text: { content: marker },
		});
		const r = await runOfficeCli("wecom", ["msg", "send_message", payload]);
		return { ok: r.ok, detail: r.ok ? marker : r.stderr || r.stdout.slice(0, 160) };
	});
	if (!okSend) return false;

	return step("wecom", "read-back", async () => {
		const day = new Date();
		const y = day.getFullYear();
		const m = String(day.getMonth() + 1).padStart(2, "0");
		const d = String(day.getDate()).padStart(2, "0");
		const payload = JSON.stringify({
			chat_type: 1,
			chatid: userId,
			begin_time: `${y}-${m}-${d} 00:00:00`,
			end_time: `${y}-${m}-${d} 23:59:59`,
		});
		const r = await runOfficeCli("wecom", ["msg", "get_message", payload]);
		const hit = r.stdout.includes(marker);
		return {
			ok: r.ok && hit,
			detail: hit ? `found ${marker}` : r.stderr || "marker not in today's messages",
		};
	});
}

async function main() {
	const channels = await probeOfficeChannels();
	const byId = new Map(channels.map((c) => [c.id, c]));
	let ran = 0;
	let failed = 0;

	const want = (id: string) => !only || only === id;

	for (const [id, run] of [
		["feishu", verifyFeishu],
		["dingtalk", verifyDingtalk],
		["wecom", verifyWecom],
	] as const) {
		if (!want(id)) continue;
		const ch = byId.get(id);
		if (!ch?.installed || !ch.authed) {
			console.log(`SKIP  ${id.padEnd(8)} not ready  installed=${ch?.installed ?? false} authed=${ch?.authed ?? false}`);
			continue;
		}
		ran += 1;
		const ok = await run();
		if (!ok) failed += 1;
	}

	console.log("\n---");
	console.log(`ran=${ran} failed=${failed} steps=${results.length}`);
	if (ran === 0) {
		console.log("没有可跑的已登录 IM 渠道。先跑 verify-integrations.ts 看登录状态。");
		process.exit(2);
	}
	process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
