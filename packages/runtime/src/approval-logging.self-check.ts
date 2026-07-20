/**
 * withApprovalLogging：给 deps.requestUserAction 包一层落盘（approval.requested/resolved），
 * 唯一调用点是 orchestrator.ts 里 ensureExecutionPrerequisites 之前（Gmail/浏览器/屏幕录制 HITL）。
 * 这里直接测包装函数本身，不用搭一整套 runTask 的 mock 依赖。
 * Run: pnpm exec tsx packages/runtime/src/approval-logging.self-check.ts
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { listRunEvents } from "@fold/memory";
import { withApprovalLogging } from "./orchestrator.js";
import type { OrchestratorDeps, UserActionRequest } from "./types.js";

const dataDir = mkdtempSync(join(tmpdir(), "fold-approval-log-self-check-"));
const runId = randomUUID();

function baseDeps(requestUserAction: OrchestratorDeps["requestUserAction"]): OrchestratorDeps {
	return { getLiveContext: () => ({ events: [] }) as never, dataDir, requestUserAction };
}

// 授权成功：记一条 approval.requested + 一条 approval.resolved（带选择结果和耗时）。
{
	const req: UserActionRequest = {
		title: "需要连接你的 Chrome",
		message: "配置 CDP 后自动继续",
		options: [{ id: "cdp:poll-done", label: "已完成配置" }, { id: "cancel", label: "取消" }],
		risk: "sensitive",
	};
	const wrapped = withApprovalLogging(runId, baseDeps(async () => "cdp:poll-done"));
	const choice = await wrapped.requestUserAction!(req);
	assert.equal(choice, "cdp:poll-done");

	const events = listRunEvents(runId, dataDir);
	assert.equal(events[0]?.type, "approval.requested");
	assert.deepEqual(events[0]?.payload, {
		title: req.title,
		message: req.message,
		risk: "sensitive",
		optionIds: ["cdp:poll-done", "cancel"],
	});
	assert.equal(events[1]?.type, "approval.resolved");
	assert.equal((events[1]?.payload as { choice?: string }).choice, "cdp:poll-done");
	assert.equal(typeof (events[1]?.payload as { latencyMs?: number }).latencyMs, "number");
}

// 用户取消（抛错）：也要落一条 approval.resolved(choice:"cancel")，不能因为异常就漏记。
{
	const runId2 = randomUUID();
	const wrapped = withApprovalLogging(
		runId2,
		baseDeps(async () => {
			throw new Error("用户取消了授权");
		}),
	);
	await assert.rejects(
		wrapped.requestUserAction!({ title: "t", message: "m", options: [{ id: "cancel", label: "取消" }] }),
		/用户取消了授权/,
	);
	const events = listRunEvents(runId2, dataDir);
	assert.equal(events[1]?.type, "approval.resolved");
	assert.equal((events[1]?.payload as { choice?: string }).choice, "cancel");
}

// 没有 requestUserAction（如 headless/无 HITL 场景）：原样返回 deps，不报错。
{
	const deps: OrchestratorDeps = { getLiveContext: () => ({ events: [] }) as never, dataDir };
	assert.equal(withApprovalLogging(randomUUID(), deps), deps);
}

console.log("approval-logging self-check passed");
