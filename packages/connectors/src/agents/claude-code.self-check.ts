import assert from "node:assert/strict";
import { describeClaudeStreamLine, parseClaudeStreamJson } from "./claude-code.js";

// 真机跑 `claude -p --output-format stream-json --verbose` 抓到的真实事件形状（会话/结果字段名以此为准）。
const initLine = JSON.stringify({
	type: "system",
	subtype: "init",
	session_id: "5136cb94-6465-4e88-9b8f-6503b739b3cd",
	cwd: "/private/tmp",
});
const resultLine = JSON.stringify({
	type: "result",
	subtype: "success",
	result: "done",
	session_id: "5136cb94-6465-4e88-9b8f-6503b739b3cd",
	total_cost_usd: 0.0123,
});

// tool_use content block 是 Anthropic Messages API 的标准形状（文档稳定，本机未能实测——账号计费问题在任何工具调用前就报错）。
const toolUseLine = JSON.stringify({
	type: "assistant",
	message: { role: "assistant", content: [{ type: "tool_use", id: "t1", name: "Edit", input: {} }] },
});
const textOnlyLine = JSON.stringify({
	type: "assistant",
	message: { role: "assistant", content: [{ type: "text", text: "hi" }] },
});

const parsed = parseClaudeStreamJson([initLine, resultLine].join("\n"));
assert.equal(parsed.result, "done");
assert.equal(parsed.session_id, "5136cb94-6465-4e88-9b8f-6503b739b3cd");
assert.equal(parsed.total_cost_usd, 0.0123);
// 多个 result 行时取最后一行（stream 里 result 只应出现一次，但防御性地不假设）。
assert.equal(
	parseClaudeStreamJson([resultLine, JSON.stringify({ type: "result", result: "later" })].join("\n")).result,
	"later",
);
// 没有 result 行、或混入非 JSON 噪音时不炸。
assert.deepEqual(parseClaudeStreamJson("not json\n" + initLine), {});

assert.equal(describeClaudeStreamLine(toolUseLine), "使用工具: Edit");
assert.equal(describeClaudeStreamLine(textOnlyLine), null);
assert.equal(describeClaudeStreamLine(initLine), null);
assert.equal(describeClaudeStreamLine("not json"), null);

console.log("claude-code self-check passed");
