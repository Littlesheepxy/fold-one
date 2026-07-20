/**
 * HITL main-process response policy (no Electron).
 * Mirrors apps/desktop/electron/main.ts handleInteractionResponse / handleInteractionVoice.
 *
 * 用法：node --import tsx apps/desktop/electron/hitl-response-policy.self-check.ts
 */
import assert from "node:assert/strict";
import {
	matchUserActionVoice,
	normalizeUserActionRequest,
	type UserActionResponse,
} from "@fold/runtime";
import { InteractionBroker, MemoryInteractionStore } from "./interaction-broker.js";

type Emit = Record<string, unknown>;

/** Minimal stand-in for the overlay-facing response path in main.ts */
async function handleInteractionResponse(
	broker: InteractionBroker,
	response: UserActionResponse,
	emit: (state: Emit) => void,
	runUserAction: (optionId: string) => Promise<void>,
	executeTask: (text: string) => Promise<void>,
): Promise<void> {
	const record = broker.current();
	if (!record) return;
	if (response.requestId && response.requestId !== record.id) return;

	if (response.optionId === "cancel") {
		broker.cancel("用户取消了授权");
		emit({ status: "idle", result: "已取消", interaction: null });
		return;
	}

	if (!response.optionId && response.text?.trim() && !record.request.input.acceptFreeform) {
		broker.updatePresentation({
			listening: false,
			draft: response.text.trim(),
			validationMessage: "没匹配到选项，再说一次或直接点按钮。",
		});
		emit({ status: "ask", validationMessage: broker.current()?.presentation?.validationMessage });
		return;
	}

	if (response.optionId) await runUserAction(response.optionId);
	const resolution = broker.respond(response);
	if (!resolution) return;
	emit({ status: "working", interaction: null });

	const skipExecute =
		resolution.record.runContext?.skipExecuteOnRestore === true;
	if (!resolution.wasLive && resolution.record.intent && !skipExecute) {
		const answer = response.optionId ?? response.text?.trim() ?? "";
		await executeTask(`${resolution.record.intent}\n已恢复的用户回答：${answer}`);
	}
}

async function handleInteractionVoice(
	broker: InteractionBroker,
	transcript: string,
	emit: (state: Emit) => void,
	runUserAction: (optionId: string) => Promise<void>,
	executeTask: (text: string) => Promise<void>,
): Promise<void> {
	const record = broker.current();
	if (!record) return;
	const text = transcript.trim();
	const matched = matchUserActionVoice(text, record.request.options);
	if (matched) {
		await handleInteractionResponse(
			broker,
			{ requestId: record.id, optionId: matched.id, text, modality: "voice" },
			emit,
			runUserAction,
			executeTask,
		);
		return;
	}
	if (!record.request.input.allowVoice) return;
	if (record.request.input.acceptFreeform) {
		await handleInteractionResponse(
			broker,
			{ requestId: record.id, text, modality: "voice" },
			emit,
			runUserAction,
			executeTask,
		);
		return;
	}
	broker.updatePresentation({
		listening: false,
		draft: text,
		validationMessage: "没匹配到选项，再说一次或直接点按钮。",
	});
	emit({ status: "ask", validationMessage: broker.current()?.presentation?.validationMessage });
}

let passed = 0;
function check(name: string, ok: boolean) {
	console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
	assert.ok(ok, name);
	passed += 1;
}

async function main() {
	const confirm = normalizeUserActionRequest({
		title: "发送飞书消息前，请确认",
		message: "产品讨论群\nE2E 已通过。",
		hint: "将向外部发送消息",
		kind: "confirm",
		risk: "external",
		options: [
			{ id: "allow-once", label: "允许这一次", tone: "primary" },
			{ id: "edit", label: "编辑后发送" },
			{ id: "cancel", label: "取消任务", tone: "danger" },
		],
	});

	// 1) click allow-once → working + runUserAction
	{
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		const emits: Emit[] = [];
		const actions: string[] = [];
		void broker.request(confirm, "发送飞书 E2E 结果到产品讨论群");
		const id = broker.current()!.id;
		await handleInteractionResponse(
			broker,
			{ requestId: id, optionId: "allow-once", modality: "click" },
			(s) => emits.push(s),
			async (optionId) => {
				actions.push(optionId);
			},
			async () => {
				throw new Error("live path should not re-executeTask");
			},
		);
		check("click.allow→working", emits.at(-1)?.status === "working");
		check("click.allow→runUserAction", actions[0] === "allow-once");
		check("click.allow→cleared", broker.current() === null);
	}

	// 2) cancel → idle, no runUserAction
	{
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		const emits: Emit[] = [];
		const actions: string[] = [];
		const cancelPromise = broker.request(confirm, "将被取消的任务");
		await handleInteractionResponse(
			broker,
			{ requestId: broker.current()!.id, optionId: "cancel", modality: "click" },
			(s) => emits.push(s),
			async (optionId) => {
				actions.push(optionId);
			},
			async () => undefined,
		);
		await assert.rejects(cancelPromise, /用户取消了授权/);
		check("cancel→idle", emits.at(-1)?.status === "idle");
		check("cancel→result", emits.at(-1)?.result === "已取消");
		check("cancel→noAction", actions.length === 0);
		check("cancel→cleared", broker.current() === null);
	}

	// 3) freeform text on choice card → validation, stay pending
	{
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		const emits: Emit[] = [];
		void broker.request(confirm, "需要选项");
		await handleInteractionResponse(
			broker,
			{ requestId: broker.current()!.id, text: "随便说说", modality: "text" },
			(s) => emits.push(s),
			async () => {
				throw new Error("should not run");
			},
			async () => undefined,
		);
		check("freeform→stillAsk", emits.at(-1)?.status === "ask");
		check(
			"freeform→validation",
			String(emits.at(-1)?.validationMessage ?? "").includes("没匹配到选项"),
		);
		check("freeform→stillPending", broker.current() !== null);
		check("freeform→draft", broker.current()?.presentation?.draft === "随便说说");
	}

	// 4) voice match「允许这一次」
	{
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		const emits: Emit[] = [];
		const actions: string[] = [];
		void broker.request(confirm, "语音确认");
		await handleInteractionVoice(
			broker,
			"允许这一次",
			(s) => emits.push(s),
			async (optionId) => {
				actions.push(optionId);
			},
			async () => undefined,
		);
		check("voice.allow→working", emits.at(-1)?.status === "working");
		check("voice.allow→action", actions[0] === "allow-once");
	}

	// 5) voice unmatched → validation
	{
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		const emits: Emit[] = [];
		void broker.request(confirm, "语音未匹配");
		await handleInteractionVoice(
			broker,
			"今天天气怎么样",
			(s) => emits.push(s),
			async () => {
				throw new Error("should not run");
			},
			async () => undefined,
		);
		check("voice.miss→ask", emits.at(-1)?.status === "ask");
		check("voice.miss→pending", broker.current() !== null);
	}

	// 6) restored (wasLive=false) → executeTask with answer
	{
		const store = new MemoryInteractionStore();
		const first = new InteractionBroker(store);
		void first.request(confirm, "恢复发送飞书");
		const restored = new InteractionBroker(store);
		const emits: Emit[] = [];
		const tasks: string[] = [];
		const actions: string[] = [];
		await handleInteractionResponse(
			restored,
			{ requestId: restored.current()!.id, optionId: "edit", modality: "click" },
			(s) => emits.push(s),
			async (optionId) => {
				actions.push(optionId);
			},
			async (text) => {
				tasks.push(text);
			},
		);
		check("restore→working", emits.at(-1)?.status === "working");
		check("restore→runUserAction", actions[0] === "edit");
		check("restore→executeTask", tasks[0]?.includes("恢复发送飞书") === true);
		check("restore→answerInTask", tasks[0]?.includes("edit") === true);
	}

	// 7) restored + skipExecuteOnRestore → no executeTask (dev E2E HITL)
	{
		const e2eConfirm = normalizeUserActionRequest({
			title: "发送飞书消息前，请确认",
			message: "产品讨论群\nE2E 已通过。",
			kind: "confirm",
			risk: "external",
			runContext: { skipExecuteOnRestore: true },
			options: [
				{ id: "allow-once", label: "允许这一次", tone: "primary" },
				{ id: "cancel", label: "取消任务", tone: "danger" },
			],
		});
		const store = new MemoryInteractionStore();
		const first = new InteractionBroker(store);
		void first.request(e2eConfirm, "发送飞书 E2E 结果到产品讨论群");
		const restored = new InteractionBroker(store);
		const tasks: string[] = [];
		const actions: string[] = [];
		await handleInteractionResponse(
			restored,
			{ requestId: restored.current()!.id, optionId: "allow-once", modality: "click" },
			() => undefined,
			async (optionId) => {
				actions.push(optionId);
			},
			async (text) => {
				tasks.push(text);
			},
		);
		check("restore.skip→runUserAction", actions[0] === "allow-once");
		check("restore.skip→noExecuteTask", tasks.length === 0);
	}

	// 8) secret freeform allowed
	{
		const secret = normalizeUserActionRequest({
			title: "输入 Token",
			kind: "secret",
			options: [],
		});
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		const emits: Emit[] = [];
		const live = broker.request(secret, "保存 token");
		await handleInteractionResponse(
			broker,
			{ requestId: broker.current()!.id, text: "sk-secret-123", modality: "text" },
			(s) => emits.push(s),
			async () => undefined,
			async () => undefined,
		);
		check("secret.freeform→working", emits.at(-1)?.status === "working");
		check("secret.freeform→answer", (await live) === "sk-secret-123");
	}

	// 9) listening 时按钮应禁用 —— UI 约束用 presentation 表达
	{
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		void broker.request(confirm, "听语音时");
		broker.updatePresentation({ listening: true });
		check("listening.flag", broker.current()?.presentation?.listening === true);
		// policy: AskOptions disables option buttons when listening — data contract only
		check(
			"listening.contract",
			Boolean(broker.current()?.presentation?.listening) === true,
		);
	}

	console.log(`\nhitl-response-policy self-check passed (${passed} checks)`);
}

void main();
