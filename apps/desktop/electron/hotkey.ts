import { globalShortcut, systemPreferences } from "electron";
import {
	findHotkeyBindingConflict,
	hotkeyConfigFromBindings,
	resolveHotkeyBindings,
	type HotkeyConfigIds,
	type ResolvedHotkeyBindings,
} from "./hotkey-presets.js";

const LONG_PRESS_MS = 450;
const FALLBACK_STRUCTURE_ACCEL = "F19";
const FALLBACK_REPLY_ACCEL = "F18";

export interface HoldHotkeyHandlers {
	/** Agent toggle */
	onAgentToggle: () => void;
	/** 触发键 keydown（早于短按/长按判定）：预热麦克风，按下即可说 */
	onTriggerDown?: () => void;
	/** 触发键短按松开：切换转写录音 */
	onStructureToggle: () => void;
	/** 触发键按住达到阈值：开始代回 */
	onReplyHoldStart: () => void;
	/** 长按后松开：结束代回 */
	onReplyHoldEnd: () => void;
	/** 无 uiohook 时 F18 回退：toggle 代回 */
	onReplyToggle: () => void;
	onCancel: () => void;
	onHotkeyTest?: (event: {
		key: "right-cmd" | "f19" | "f18" | "alt-space";
		phase: "down" | "up";
		longPress?: boolean;
	}) => void;
}

export interface HotkeyRegistrationStatus {
	trigger: boolean;
	agent: boolean;
	cancel: boolean;
	triggerUsesFallback: boolean;
}

export type ApplyHotkeysResult =
	| { ok: true }
	| { ok: false; reason: "occupied" | "conflict" | "duplicate-accelerator" };

let activeHandlers: HoldHotkeyHandlers | null = null;
let activeBindings = resolveHotkeyBindings();
let stopActive: (() => void) | null = null;
let registrationStatus: HotkeyRegistrationStatus = {
	trigger: false,
	agent: false,
	cancel: false,
	triggerUsesFallback: false,
};

function hasAccessibility(): boolean {
	if (process.platform !== "darwin") return true;
	try {
		return systemPreferences.isTrustedAccessibilityClient(false);
	} catch {
		return false;
	}
}

function triggerTestKey(bindings: ResolvedHotkeyBindings): "right-cmd" | "f19" {
	if (bindings.trigger.id === "f19") return "f19";
	return "right-cmd";
}

function registerAccelerator(
	accelerator: string,
	fn: () => void,
	tracked: string[],
): boolean {
	const ok = globalShortcut.register(accelerator, fn);
	if (ok) {
		tracked.push(accelerator);
		console.log(`[fold:hotkey] 已注册: ${accelerator}`);
	} else {
		console.warn(`[fold:hotkey] 注册失败（可能被占用）: ${accelerator}`);
	}
	return ok;
}

function unregisterTracked(tracked: string[]): void {
	for (const accelerator of tracked) {
		globalShortcut.unregister(accelerator);
	}
	tracked.length = 0;
}

function startHoldHotkeySession(
	handlers: HoldHotkeyHandlers,
	bindings: ResolvedHotkeyBindings,
): { stop: () => void; status: HotkeyRegistrationStatus } {
	const ax = hasAccessibility();
	console.log(`[fold:hotkey] 辅助功能=${ax ? "已授权" : "未授权"}`);

	const trackedAccelerators: string[] = [];
	const status: HotkeyRegistrationStatus = {
		trigger: false,
		agent: false,
		cancel: false,
		triggerUsesFallback: false,
	};

	let holdActive = false;
	let longPressFired = false;
	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let stopUio: (() => void) | undefined;

	const clearLongPressTimer = () => {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	};

	const testKey = triggerTestKey(bindings);

	const onHoldDown = () => {
		handlers.onHotkeyTest?.({ key: testKey, phase: "down" });
		if (holdActive) return;
		holdActive = true;
		handlers.onTriggerDown?.();
		longPressFired = false;
		longPressTimer = setTimeout(() => {
			if (!holdActive) return;
			longPressFired = true;
			handlers.onReplyHoldStart();
		}, LONG_PRESS_MS);
	};

	const onHoldUp = () => {
		if (!holdActive) return;
		const wasLongPress = longPressFired;
		holdActive = false;
		clearLongPressTimer();
		handlers.onHotkeyTest?.({ key: testKey, phase: "up", longPress: wasLongPress });
		if (wasLongPress) handlers.onReplyHoldEnd();
		else handlers.onStructureToggle();
	};

	status.agent = registerAccelerator(bindings.agent.accelerator, () => {
		handlers.onHotkeyTest?.({ key: "alt-space", phase: "down" });
		handlers.onAgentToggle();
	}, trackedAccelerators);
	status.cancel = registerAccelerator(bindings.cancel.accelerator, handlers.onCancel, trackedAccelerators);

	if (ax) {
		try {
			const { uIOhook } = require("uiohook-napi") as typeof import("uiohook-napi");
			const holdKey = bindings.trigger.keycode;
			const onKeydown = (e: { keycode: number }) => {
				if (e.keycode === holdKey) onHoldDown();
			};
			const onKeyup = (e: { keycode: number }) => {
				if (e.keycode === holdKey) onHoldUp();
			};
			uIOhook.on("keydown", onKeydown);
			uIOhook.on("keyup", onKeyup);
			uIOhook.start();
			stopUio = () => {
				uIOhook.off("keydown", onKeydown);
				uIOhook.off("keyup", onKeyup);
				uIOhook.stop();
			};
			status.trigger = true;
			console.log(
				`[fold:hotkey] uiohook 已启动（${bindings.trigger.label} 按住≥${LONG_PRESS_MS}ms=代回 / 短按=转写）`,
			);
		} catch (err) {
			console.warn("[fold:hotkey] uiohook 启动失败，回退 F19/F18", err);
			status.triggerUsesFallback = true;
			const structureOk = registerAccelerator(FALLBACK_STRUCTURE_ACCEL, () => {
				handlers.onHotkeyTest?.({ key: "f19", phase: "down" });
				handlers.onStructureToggle();
			}, trackedAccelerators);
			const replyOk = registerAccelerator(FALLBACK_REPLY_ACCEL, () => {
				handlers.onHotkeyTest?.({ key: "f18", phase: "down" });
				handlers.onReplyToggle();
			}, trackedAccelerators);
			status.trigger = structureOk && replyOk;
		}
	} else {
		status.triggerUsesFallback = true;
		const structureOk = registerAccelerator(FALLBACK_STRUCTURE_ACCEL, () => {
			handlers.onHotkeyTest?.({ key: "f19", phase: "down" });
			handlers.onStructureToggle();
		}, trackedAccelerators);
		const replyOk = registerAccelerator(FALLBACK_REPLY_ACCEL, () => {
			handlers.onHotkeyTest?.({ key: "f18", phase: "down" });
			handlers.onReplyToggle();
		}, trackedAccelerators);
		status.trigger = structureOk && replyOk;
		console.warn(
			"[fold:hotkey] 未授权辅助功能 → F19=转写，F18=代回。开发模式请给 Electron 开辅助功能。",
		);
	}

	return {
		status,
		stop: () => {
			stopUio?.();
			unregisterTracked(trackedAccelerators);
		},
	};
}

export function getHotkeyStatus(): HotkeyRegistrationStatus {
	return { ...registrationStatus };
}

export function getActiveHotkeyBindings(): ResolvedHotkeyBindings {
	return activeBindings;
}

export function bindingsFromConfig(config: HotkeyConfigIds = {}): ResolvedHotkeyBindings {
	return resolveHotkeyBindings(config);
}

export function applyHotkeys(
	handlers: HoldHotkeyHandlers,
	nextIds: HotkeyConfigIds,
): ApplyHotkeysResult {
	const nextBindings = resolveHotkeyBindings(nextIds);
	const conflict = findHotkeyBindingConflict(nextBindings, {
		accessibilityGranted: hasAccessibility(),
	});
	if (conflict === "duplicate-accelerator") {
		return { ok: false, reason: "duplicate-accelerator" };
	}
	if (conflict) {
		return { ok: false, reason: "conflict" };
	}

	const previousBindings = activeBindings;
	const previousStatus = { ...registrationStatus };
	stopActive?.();
	stopActive = null;

	const session = startHoldHotkeySession(handlers, nextBindings);
	if (!session.status.agent || !session.status.cancel) {
		session.stop();
		const rollback = startHoldHotkeySession(handlers, previousBindings);
		activeHandlers = handlers;
		activeBindings = previousBindings;
		stopActive = rollback.stop;
		registrationStatus = rollback.status;
		return { ok: false, reason: "occupied" };
	}

	activeHandlers = handlers;
	activeBindings = nextBindings;
	stopActive = session.stop;
	registrationStatus = session.status;
	return { ok: true };
}

/**
 * ⌥Space → Agent（toggle）
 * 触发键短按松开 → 转写 toggle
 * 触发键按住 ≥450ms → 代回开始
 * Esc → 取消
 */
export function startHoldHotkey(
	handlers: HoldHotkeyHandlers,
	config: HotkeyConfigIds = {},
): () => void {
	let result = applyHotkeys(handlers, config);
	if (!result.ok && (config.trigger || config.agent || config.cancel)) {
		console.warn(`[fold:hotkey] 配置快捷键注册失败(${result.reason})，回退默认`);
		result = applyHotkeys(handlers, {});
	}
	if (!result.ok) {
		console.warn(`[fold:hotkey] 启动注册失败: ${result.reason}`);
	}
	return () => {
		stopActive?.();
		stopActive = null;
		activeHandlers = null;
	};
}

export function reloadHotkeysFromConfig(config: HotkeyConfigIds = {}): ApplyHotkeysResult {
	if (!activeHandlers) {
		return { ok: false, reason: "occupied" };
	}
	return applyHotkeys(activeHandlers, config);
}

export function hotkeyIdsForSave(bindings: ResolvedHotkeyBindings = activeBindings) {
	return hotkeyConfigFromBindings(bindings);
}
