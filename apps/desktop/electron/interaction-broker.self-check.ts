import assert from "node:assert/strict";
import {
	matchUserActionVoice,
	normalizeUserActionRequest,
} from "@fold/runtime";
import { InteractionBroker, MemoryInteractionStore } from "./interaction-broker.js";

const permission = normalizeUserActionRequest({
	title: "需要屏幕录制权限",
	message: "请完成授权",
	options: [
		{ id: "screen:open-settings", label: "打开系统设置" },
		{ id: "screen:poll-done", label: "已完成授权", voiceAliases: ["完成了"] },
		{ id: "cancel", label: "取消" },
	],
});
assert.equal(permission.kind, "permission");
assert.equal(permission.input.primary, "choice");
assert.equal(permission.input.allowVoice, true);
assert.equal(permission.options[0]?.tone, "primary");
assert.equal(permission.options[2]?.tone, "danger");
assert.equal(matchUserActionVoice("第二个", permission.options)?.id, "screen:poll-done");
assert.equal(matchUserActionVoice("我已经完成了", permission.options)?.id, "screen:poll-done");
assert.equal(matchUserActionVoice("算了", permission.options)?.id, "cancel");

const confirm = normalizeUserActionRequest({
	title: "发送飞书消息前，请确认",
	message: "产品讨论群",
	kind: "confirm",
	risk: "external",
	options: [
		{ id: "allow-once", label: "允许这一次", tone: "primary" },
		{ id: "edit", label: "编辑后发送" },
		{ id: "cancel", label: "取消任务", tone: "danger" },
	],
});
assert.equal(confirm.input.primary, "choice");
// 「这一次」里的「一」不能误命中第一项序数
assert.equal(matchUserActionVoice("允许这一次", confirm.options)?.id, "allow-once");
assert.equal(matchUserActionVoice("编辑后发送", confirm.options)?.id, "edit");
assert.equal(matchUserActionVoice("第一个", confirm.options)?.id, "allow-once");
assert.equal(matchUserActionVoice("好的", confirm.options)?.id, "allow-once");
assert.equal(matchUserActionVoice("取消任务", confirm.options)?.id, "cancel");

const secret = normalizeUserActionRequest({
	title: "输入 Token",
	message: "Token 只保存在钥匙串",
	kind: "secret",
	options: [],
});
assert.equal(secret.input.primary, "secure");
assert.equal(secret.input.allowVoice, false);

async function main() {
	const liveStore = new MemoryInteractionStore();
	const liveBroker = new InteractionBroker(liveStore);
	const liveAnswer = liveBroker.request(permission, "授权后继续截屏");
	const liveId = liveBroker.current()?.id;
	assert.ok(liveId);
	const liveResolution = liveBroker.respond({
		requestId: liveId,
		optionId: "screen:poll-done",
		modality: "click",
	});
	assert.equal(liveResolution?.wasLive, true);
	assert.equal(await liveAnswer, "screen:poll-done");
	assert.equal(liveBroker.current(), null);
	assert.deepEqual(
		liveStore.state.events.map((event) => event.type),
		[
			"interaction.requested",
			"run.paused",
			"interaction.responded",
			"run.resumed",
		],
	);

	const durableStore = new MemoryInteractionStore();
	const firstProcess = new InteractionBroker(durableStore);
	void firstProcess.request(permission, "恢复这个任务");
	const restoredProcess = new InteractionBroker(durableStore);
	assert.equal(restoredProcess.current()?.intent, "恢复这个任务");
	const restoredResolution = restoredProcess.respond({
		requestId: restoredProcess.current()?.id,
		optionId: "screen:poll-done",
		modality: "click",
	});
	assert.equal(restoredResolution?.wasLive, false);
	assert.equal(restoredProcess.current(), null);

	console.log("interaction-broker self-check passed");
}

void main();
