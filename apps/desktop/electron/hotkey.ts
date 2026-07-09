import { globalShortcut, systemPreferences } from "electron";

const LONG_PRESS_MS = 450;

export interface HoldHotkeyHandlers {
	/** ⌥Space：语音 → Agent */
	onAgentToggle: () => void;
	/** 短按 右⌘：语音 → 结构化整理 */
	onStructureToggle: () => void;
	/** 长按 右⌘：情境拟回复 */
	onReply: () => void;
	onCancel: () => void;
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
 * ⌥Space → Agent（两个键）
 * 右⌘ 短按松开 → 语音整理；长按松开 → 拟回复（一个键）
 * Esc → 取消
 *
 * 无辅助功能时无法区分左右 ⌘ / 长短按，回退 F19=整理、F18=拟回复。
 */
export function startHoldHotkey(handlers: HoldHotkeyHandlers): () => void {
	const ax = hasAccessibility();
	console.log(`[fold:hotkey] 辅助功能=${ax ? "已授权" : "未授权"}`);

	let holdStartedAt = 0;
	let holdActive = false;
	let stopUio: (() => void) | undefined;

	const onHoldDown = () => {
		if (holdActive) return;
		holdActive = true;
		holdStartedAt = Date.now();
	};

	const onHoldUp = () => {
		if (!holdActive) return;
		holdActive = false;
		const heldMs = Date.now() - holdStartedAt;
		holdStartedAt = 0;
		if (heldMs >= LONG_PRESS_MS) handlers.onReply();
		else handlers.onStructureToggle();
	};

	registerOrLog("Alt+Space", handlers.onAgentToggle);
	registerOrLog("Escape", handlers.onCancel);

	if (ax) {
		try {
			const { uIOhook, UiohookKey } = require("uiohook-napi") as typeof import("uiohook-napi");
			// 右侧 Command = 一个物理键（左边 ⌘ 仍可正常打快捷键）
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
			console.log("[fold:hotkey] uiohook 已启动（右⌘ 短按松开=整理 / 长按松开=拟回复）");
		} catch (err) {
			console.warn("[fold:hotkey] uiohook 启动失败，回退 F19/F18", err);
			registerOrLog("F19", handlers.onStructureToggle);
			registerOrLog("F18", handlers.onReply);
		}
	} else {
		registerOrLog("F19", handlers.onStructureToggle);
		registerOrLog("F18", handlers.onReply);
		console.warn(
			"[fold:hotkey] 未授权辅助功能 → F19=整理，F18=拟回复。开发模式请给 Electron 开辅助功能。",
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
