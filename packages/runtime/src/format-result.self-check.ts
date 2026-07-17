import assert from "node:assert/strict";
import { buildResultDetail, buildUserVisibleSummary, formatOfficeCliFeedback } from "./format-result.js";

const feishu = {
	ok: true,
	channel: "feishu",
	operation: "发送消息",
	stdout: JSON.stringify({ data: { message_id: "om_1234567890" } }),
	stderr: "",
	exitCode: 0,
};
assert.equal(formatOfficeCliFeedback(feishu), "飞书：消息已发送（回执 om_1234567890）");

const wecom = {
	ok: true,
	channel: "wecom",
	operation: "读取消息",
	stdout: JSON.stringify({ data: { messages: [{ id: 1 }, { id: 2 }] } }),
	stderr: "",
	exitCode: 0,
};
assert.equal(formatOfficeCliFeedback(wecom), "企业微信：已读取 2 条消息");

const dingtalk = {
	ok: true,
	channel: "dingtalk",
	operation: "创建待办",
	stdout: JSON.stringify({ result: { taskId: "task-42" } }),
	stderr: "",
	exitCode: 0,
};
assert.equal(formatOfficeCliFeedback(dingtalk), "钉钉：创建待办（待办 task-42）");

assert.equal(
	formatOfficeCliFeedback({
		ok: true,
		channel: "feishu",
		operation: "获取本人信息",
		stdout: JSON.stringify({ data: { user: { open_id: "ou_test" } } }),
	}),
	"飞书：已确认本人身份",
);

const steps = [
	{
		skill: "office.cli",
		status: "success" as const,
		output: feishu,
	},
];
assert.equal(buildUserVisibleSummary("给自己发条测试消息", steps), "飞书：消息已发送（回执 om_1234567890）");
assert.match(buildResultDetail("给自己发条测试消息", steps), /消息已发送/);

console.log("format-result self-check passed");
