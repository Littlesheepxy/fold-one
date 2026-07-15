import { globalShortcut, systemPreferences } from "electron";

const LONG_PRESS_MS = 450;

export interface HoldHotkeyHandlers {
	/** ⌥Space：语音 → Agent */
	onAgentToggle: () => void;
	/** 右⌘ 短按松开：切换转写录音（按一下开始，再按一下结束） */
	onStructureToggle: () => void;
	/** 右⌘ 按住达到阈值：开始代回（按住说话） */
	onReplyHoldStart: () => void;
	/** 右⌘ 长按后松开：结束代回 */
	onReplyHoldEnd: () => void;
	/** 无 uiohook 时 F18 回退：toggle 代回 */
	onReplyToggle: () => void;
	onCancel: () => void;
	/** onboarding 热键测试：仅通知 UI，不替代真实热键逻辑 */
	onHotkeyTest?: (event: {
		key: "right-cmd" | "f19" | "f18" | "alt-space";
		phase: "down" | "up";
		longPress?: boolean;
	}) => void;
}

function hasAccessibility(): boolean {
	if (process.platform !== "darwin") return true;
	try {
		return systemPreferences.isTrustedAccessibilityClient(false);
	} catch {
		return false;
	}
}

function registerOrLog(accelerator: string, fn: () => void): boolean {
	const ok = globalShortcut.register(accelerator, fn);
	if (!ok) console.warn(`[fold:hotkey] 注册失败（可能被占用）: ${accelerator}`);
	else console.log(`[fold:hotkey] 已注册: ${accelerator}`);
	return ok;
}

/**
 * ⌥Space → Agent（toggle）
 * 右⌘ 短按松开 → 转写 toggle（按一下录，再按一下停）
 * 右⌘ 按住 ≥450ms → 代回开始（松开继续录）；短按 → 结束出草案
 * 确认卡上再按住 → 说修改要求；松开 → 更新草案
 * Esc → 取消
 */
export function startHoldHotkey(handlers: HoldHotkeyHandlers): () => void {
	const ax = hasAccessibility();
	console.log(`[fold:hotkey] 辅助功能=${ax ? "已授权" : "未授权"}`);

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

	const onHoldDown = () => {
		handlers.onHotkeyTest?.({ key: "right-cmd", phase: "down" });
		if (holdActive) return;
		holdActive = true;
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
		handlers.onHotkeyTest?.({ key: "right-cmd", phase: "up", longPress: wasLongPress });
		if (wasLongPress) handlers.onReplyHoldEnd();
		else handlers.onStructureToggle();
	};

	registerOrLog("Alt+Space", () => {
		handlers.onHotkeyTest?.({ key: "alt-space", phase: "down" });
		handlers.onAgentToggle();
	});
	registerOrLog("Escape", handlers.onCancel);

	if (ax) {
		try {
			const { uIOhook, UiohookKey } = require("uiohook-napi") as typeof import("uiohook-napi");
			const HOLD_KEY = UiohookKey.MetaRight;
			const onKeydown = (e: { keycode: number }) => {
				if (e.keycode === HOLD_KEY) onHoldDown();
			};
			const onKeyup = (e: { keycode: number }) => {
				if (e.keycode === HOLD_KEY) onHoldUp();
			};
			uIOhook.on("keydown", onKeydown);
			uIOhook.on("keyup", onKeyup);
			uIOhook.start();
			stopUio = () => {
				uIOhook.off("keydown", onKeydown);
				uIOhook.off("keyup", onKeyup);
				uIOhook.stop();
			};
			console.log("[fold:hotkey] uiohook 已启动（右⌘ 按住≥450ms=代回 / 短按=转写）");
		} catch (err) {
			console.warn("[fold:hotkey] uiohook 启动失败，回退 F19/F18", err);
			registerOrLog("F19", () => {
				handlers.onHotkeyTest?.({ key: "f19", phase: "down" });
				handlers.onStructureToggle();
			});
			registerOrLog("F18", () => {
				handlers.onHotkeyTest?.({ key: "f18", phase: "down" });
				handlers.onReplyToggle();
			});
		}
	} else {
		registerOrLog("F19", () => {
			handlers.onHotkeyTest?.({ key: "f19", phase: "down" });
			handlers.onStructureToggle();
		});
		registerOrLog("F18", () => {
			handlers.onHotkeyTest?.({ key: "f18", phase: "down" });
			handlers.onReplyToggle();
		});
		console.warn(
			"[fold:hotkey] 未授权辅助功能 → F19=转写，F18=代回。开发模式请给 Electron 开辅助功能。",
		);
	}

	return () => {
		stopUio?.();
		globalShortcut.unregister("Alt+Space");
		globalShortcut.unregister("F19");
		globalShortcut.unregister("F18");
		globalShortcut.unregister("Escape");
	};
}
