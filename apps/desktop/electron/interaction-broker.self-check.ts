import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	matchUserActionVoice,
	normalizeUserActionRequest,
} from "@fold/runtime";
import {
	FileInteractionStore,
	InteractionBroker,
	MemoryInteractionStore,
} from "./interaction-broker.js";

let passed = 0;
function check(name: string, ok: boolean) {
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
	assert.ok(ok, name);
	passed += 1;
}

const permission = normalizeUserActionRequest({
	title: "需要屏幕录制权限",
	message: "请完成授权",
	options: [
		{ id: "screen:open-settings", label: "打开系统设置" },
		{ id: "screen:poll-done", label: "已完成授权", voiceAliases: ["完成了"] },
		{ id: "cancel", label: "取消" },
	],
});
check("permission.kind", permission.kind === "permission");
check("permission.primary=choice", permission.input.primary === "choice");
check("permission.allowVoice", permission.input.allowVoice === true);
check("permission.tone.primary", permission.options[0]?.tone === "primary");
check("permission.tone.danger", permission.options[2]?.tone === "danger");
check("voice.第二个", matchUserActionVoice("第二个", permission.options)?.id === "screen:poll-done");
check("voice.我已经完成了", matchUserActionVoice("我已经完成了", permission.options)?.id === "screen:poll-done");
check("voice.算了", matchUserActionVoice("算了", permission.options)?.id === "cancel");
check("voice.最后一个", matchUserActionVoice("最后一个", permission.options)?.id === "cancel");
check("voice.空串", matchUserActionVoice("   ", permission.options) === null);

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
check("confirm.primary=choice", confirm.input.primary === "choice");
check("confirm.risk=external", confirm.risk === "external");
// 「这一次」里的「一」不能误命中第一项序数
check("voice.允许这一次≠序数一", matchUserActionVoice("允许这一次", confirm.options)?.id === "allow-once");
check("voice.编辑后发送", matchUserActionVoice("编辑后发送", confirm.options)?.id === "edit");
check("voice.第一个", matchUserActionVoice("第一个", confirm.options)?.id === "allow-once");
check("voice.好的→allow", matchUserActionVoice("好的", confirm.options)?.id === "allow-once");
check("voice.取消任务", matchUserActionVoice("取消任务", confirm.options)?.id === "cancel");
check("voice.选项3", matchUserActionVoice("选项3", confirm.options)?.id === "cancel");
// 短词「发送」不应压过更长别名「编辑后发送」——若只说「发送」可能命中 allow 别名，这是预期模糊区
check("voice.修改后再发", matchUserActionVoice("修改后再发", confirm.options)?.id === "edit");

const secret = normalizeUserActionRequest({
	title: "输入 Token",
	message: "Token 只保存在钥匙串",
	kind: "secret",
	options: [],
});
check("secret.primary=secure", secret.input.primary === "secure");
check("secret.allowVoice=false", secret.input.allowVoice === false);
check("secret.acceptFreeform", secret.input.acceptFreeform === true);

async function main() {
	const liveStore = new MemoryInteractionStore();
	const liveBroker = new InteractionBroker(liveStore);
	const liveAnswer = liveBroker.request(permission, "授权后继续截屏");
	const liveId = liveBroker.current()?.id;
	check("live.request.id", Boolean(liveId));
	const wrongId = liveBroker.respond({
		requestId: "not-this-id",
		optionId: "screen:poll-done",
		modality: "click",
	});
	check("live.wrongRequestId→null", wrongId === null);
	check("live.stillPending", liveBroker.current()?.id === liveId);

	const emptyRespond = liveBroker.respond({
		requestId: liveId,
		modality: "click",
	});
	check("live.emptyRespond→null", emptyRespond === null);

	const liveResolution = liveBroker.respond({
		requestId: liveId,
		optionId: "screen:poll-done",
		modality: "click",
	});
	check("live.wasLive", liveResolution?.wasLive === true);
	check("live.answer", (await liveAnswer) === "screen:poll-done");
	check("live.cleared", liveBroker.current() === null);
	check(
		"live.events",
		JSON.stringify(liveStore.state.events.map((event) => event.type)) ===
			JSON.stringify([
				"interaction.requested",
				"run.paused",
				"interaction.responded",
				"run.resumed",
			]),
	);

	// supersede: 新请求取消旧的 pending Promise
	const supersedeStore = new MemoryInteractionStore();
	const supersedeBroker = new InteractionBroker(supersedeStore);
	const first = supersedeBroker.request(permission, "第一个任务");
	const firstId = supersedeBroker.current()?.id;
	const second = supersedeBroker.request(confirm, "第二个任务");
	check("supersede.active=second", supersedeBroker.current()?.intent === "第二个任务");
	check("supersede.firstId≠second", supersedeBroker.current()?.id !== firstId);
	await assert.rejects(first, /替代/);
	const secondRes = supersedeBroker.respond({
		requestId: supersedeBroker.current()?.id,
		optionId: "allow-once",
		modality: "click",
	});
	check("supersede.second.wasLive", secondRes?.wasLive === true);
	check("supersede.second.answer", (await second) === "allow-once");
	check(
		"supersede.hasCanceledEvent",
		supersedeStore.state.events.some((e) => e.type === "interaction.canceled"),
	);

	// cancel rejects live promise
	const cancelStore = new MemoryInteractionStore();
	const cancelBroker = new InteractionBroker(cancelStore);
	const cancelPromise = cancelBroker.request(permission, "将被取消");
	cancelBroker.cancel("用户取消了授权");
	await assert.rejects(cancelPromise, /用户取消了授权/);
	check("cancel.cleared", cancelBroker.current() === null);
	check(
		"cancel.event",
		cancelStore.state.events.at(-1)?.type === "interaction.canceled",
	);

	// durable memory restore (process restart simulation)
	const durableStore = new MemoryInteractionStore();
	const firstProcess = new InteractionBroker(durableStore);
	void firstProcess.request(permission, "恢复这个任务");
	const restoredProcess = new InteractionBroker(durableStore);
	check("durable.intent", restoredProcess.current()?.intent === "恢复这个任务");
	const restoredResolution = restoredProcess.respond({
		requestId: restoredProcess.current()?.id,
		optionId: "screen:poll-done",
		modality: "click",
	});
	check("durable.wasLive=false", restoredResolution?.wasLive === false);
	check("durable.cleared", restoredProcess.current() === null);

	// FileInteractionStore 真落盘
	const dir = mkdtempSync(join(tmpdir(), "fold-hitl-"));
	const filePath = join(dir, "interaction-state.json");
	try {
		const fileStoreA = new FileInteractionStore(filePath);
		const fileBrokerA = new InteractionBroker(fileStoreA);
		void fileBrokerA.request(confirm, "文件持久化任务");
		fileBrokerA.updatePresentation({ listening: true, draft: "允许" });
		check("file.active", fileBrokerA.current()?.intent === "文件持久化任务");
		check("file.listening", fileBrokerA.current()?.presentation?.listening === true);

		const raw = JSON.parse(readFileSync(filePath, "utf8")) as {
			version: number;
			active: { intent: string; presentation?: { listening?: boolean } } | null;
		};
		check("file.version=1", raw.version === 1);
		check("file.disk.intent", raw.active?.intent === "文件持久化任务");
		check("file.disk.listening", raw.active?.presentation?.listening === true);

		const fileStoreB = new FileInteractionStore(filePath);
		const fileBrokerB = new InteractionBroker(fileStoreB);
		check("file.reload.intent", fileBrokerB.current()?.intent === "文件持久化任务");
		check("file.reload.listening", fileBrokerB.current()?.presentation?.listening === true);
		const fileRes = fileBrokerB.respond({
			requestId: fileBrokerB.current()?.id,
			optionId: "edit",
			modality: "text",
		});
		check("file.reload.wasLive=false", fileRes?.wasLive === false);
		check("file.reload.cleared", fileBrokerB.current() === null);

		const after = JSON.parse(readFileSync(filePath, "utf8")) as { active: null };
		check("file.disk.cleared", after.active === null);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}

	console.log(`\ninteraction-broker self-check passed (${passed} checks)`);
}

void main();
