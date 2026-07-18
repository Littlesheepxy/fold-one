import assert from "node:assert/strict";
import { describeCodexItem } from "./codex-app-server.js";

// 真机跑一次 codex app-server turn 抓到的真实 item/completed payload（见 PR 记录），字段名以此为准。
assert.equal(
	describeCodexItem({
		type: "commandExecution",
		id: "exec-1",
		command: "/bin/zsh -lc 'echo hello-from-codex'",
		status: "completed",
		aggregatedOutput: "hello-from-codex\n",
		exitCode: 0,
	}),
	"运行命令: /bin/zsh -lc 'echo hello-from-codex'",
);

assert.equal(
	describeCodexItem({
		type: "fileChange",
		id: "exec-2",
		status: "completed",
		changes: [{ path: "/tmp/codex-dump-test.txt", kind: { type: "add" }, diff: "done\n" }],
	}),
	"编辑文件: /tmp/codex-dump-test.txt",
);

assert.equal(
	describeCodexItem({ type: "mcpToolCall", server: "lark-mcp", tool: "im_v1_message_create", status: "completed" }),
	"调用工具: lark-mcp/im_v1_message_create",
);

assert.equal(describeCodexItem({ type: "webSearch", query: "codex app-server schema" }), "搜索: codex app-server schema");

// agentMessage / reasoning 已由既有的 agentText 逻辑处理，这里不重复发消息（避免刷屏）。
assert.equal(describeCodexItem({ type: "agentMessage", text: "hi" }), null);
assert.equal(describeCodexItem({ type: "reasoning" }), null);
assert.equal(describeCodexItem(undefined), null);
assert.equal(describeCodexItem({ type: "commandExecution" }), null);

console.log("codex-app-server self-check passed");
