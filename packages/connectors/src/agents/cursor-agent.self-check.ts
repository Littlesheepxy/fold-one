import assert from "node:assert/strict";
import { describeCursorStreamLine, parseCursorStreamJson } from "./cursor-agent.js";

// schema 来自 cursor.com/docs/cli/reference/output-format 官方文档，本机 CLI 未登录未能实测，
// 但字段名有官方文档 + 两份独立第三方 TS 类型定义互相印证，可信度足够。
const resultLine = JSON.stringify({
	type: "result",
	subtype: "success",
	result: "done",
	session_id: "sess-abc123",
	is_error: false,
});
const shellStartedLine = JSON.stringify({
	type: "tool_call",
	subtype: "started",
	call_id: "call-1",
	tool_call: { shellToolCall: { args: { command: "ls -la" } } },
	session_id: "sess-abc123",
});
const readStartedLine = JSON.stringify({
	type: "tool_call",
	subtype: "started",
	call_id: "call-2",
	tool_call: { readToolCall: { args: { path: "file.txt" } } },
});
const toolCompletedLine = JSON.stringify({
	type: "tool_call",
	subtype: "completed",
	call_id: "call-1",
	tool_call: { shellToolCall: { args: { command: "ls -la" }, result: { success: { exitCode: 0 } } } },
});

const parsed = parseCursorStreamJson([shellStartedLine, resultLine].join("\n"));
assert.equal(parsed.result, "done");
assert.equal(parsed.session_id, "sess-abc123");
assert.deepEqual(parseCursorStreamJson("not json"), {});

assert.equal(describeCursorStreamLine(shellStartedLine), "运行命令: ls -la");
assert.equal(describeCursorStreamLine(readStartedLine), "读取文件: file.txt");
// completed 阶段不重复上报（started 已经报过一次，避免刷屏）。
assert.equal(describeCursorStreamLine(toolCompletedLine), null);
assert.equal(describeCursorStreamLine(resultLine), null);
assert.equal(describeCursorStreamLine("not json"), null);

console.log("cursor-agent self-check passed");
