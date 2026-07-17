import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createEmptyContext } from "@fold/context";
import { officeCli } from "./office.js";
import type { SkillContext } from "../types.js";

/**
 * P0 幂等验收：消息已发出但进程在返回前崩溃，重启后不得重复发送。
 * 共享 ledger 模拟跨进程持久化的 side_effect_receipts；
 * 注入 runOfficeCliImpl 计数真实发送次数；每个场景换新 run/envelope 模拟重启。
 */

const SEND_ARGS = ["im", "+messages-send", "--as", "user", "--user-id", "ou_self", "--text", "P0 不重复发送"];
const inputHash = createHash("sha256").update(JSON.stringify(SEND_ARGS)).digest("hex");
const stableKey = `fold:feishu:发送消息:${inputHash.slice(0, 16)}`;

interface LedgerEntry {
	status: "requested" | "confirmed" | "uncertain" | "failed";
	verification?: unknown;
	updatedAt?: number;
}

const ledger = new Map<string, LedgerEntry>();
let sendCount = 0;
let runSeq = 0;

function makeCtx(overrides: Partial<SkillContext> = {}): SkillContext {
	runSeq += 1; // 每次调用 = 新 run，模拟重启后重新发起同一意图
	return {
		liveContext: createEmptyContext(),
		previousResults: new Map(),
		emit: () => {},
		agentTaskEnvelope: {
			runId: `run-${runSeq}`,
			goal: "给自己发消息",
			currentState: "ready_to_execute",
			context: {},
			relevantMemories: [],
			previousAttempts: [],
			availableCapabilities: ["office.cli"],
			constraints: [],
			acceptanceCriteria: [],
			idempotencyKey: `fold:run-${runSeq}`,
		},
		lookupSideEffectReceipt: (key) => ledger.get(key) ?? null,
		recordSideEffectRequest: (input) => {
			ledger.set(input.idempotencyKey, { status: "requested", updatedAt: Date.now() });
		},
		runOfficeCliImpl: async (channel) => {
			sendCount += 1;
			return {
				ok: true,
				channel: "feishu",
				stdout: `{"message_id":"om_${sendCount}"}`,
				stderr: "",
				exitCode: 0,
			};
		},
		...overrides,
	};
}

async function send(ctx: SkillContext) {
	return (await officeCli({ channel: "feishu", args: [...SEND_ARGS] }, ctx)) as Record<string, unknown>;
}

// 场景 1：首发正常发送，receipt 落 requested；key 由内容稳定派生，与 run 无关
{
	const result = await send(makeCtx());
	assert.equal(sendCount, 1);
	assert.equal(result.idempotencyKey, stableKey, "幂等键应稳定派生于内容而非 per-run taskId");
	assert.equal(ledger.get(stableKey)?.status, "requested");
	assert.ok(result.externalRef);
}

// 场景 2：崩溃窗口（receipt 停留 requested）+ 重启新 run + 无 verifier → 不得重发
{
	const result = await send(makeCtx());
	assert.equal(sendCount, 1, "崩溃重启后不得重复发送");
	assert.equal(result.reusedReceipt, true);
	assert.equal(result.receiptStatus, "uncertain");
}

// 场景 3：崩溃窗口 + verifier 确认已送达 → 不重发，按 confirmed 复用
{
	const result = await send(makeCtx({ verifySideEffectReceipt: () => "delivered" }));
	assert.equal(sendCount, 1, "已送达核对后不得重发");
	assert.equal(result.receiptStatus, "confirmed");
	assert.equal(result.reusedReceipt, true);
}

// 场景 4：verifier 确认未送达 → 允许补发一次
{
	const result = await send(makeCtx({ verifySideEffectReceipt: () => "not_delivered" }));
	assert.equal(sendCount, 2, "确认未送达时应补发");
	assert.ok(result.externalRef);
}

// 场景 5：confirmed 新鲜 receipt → 直接复用缓存结果
{
	ledger.set(stableKey, {
		status: "confirmed",
		updatedAt: Date.now(),
		verification: { ok: true, channel: "feishu", externalRef: "om_cached" },
	});
	const result = await send(makeCtx());
	assert.equal(sendCount, 2);
	assert.equal(result.externalRef, "om_cached");
	assert.equal(result.reusedReceipt, true);
}

// 场景 6：receipt 过期（超过重放窗口）→ 视为新意图，允许有意重发
{
	ledger.set(stableKey, { status: "confirmed", updatedAt: Date.now() - 16 * 60_000 });
	await send(makeCtx());
	assert.equal(sendCount, 3, "过期 receipt 不应拦截有意重发");
}

console.log("office recovery (idempotency) self-check passed");
