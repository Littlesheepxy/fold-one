import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ContextEngine } from "@fold/context";
import { openGogAuthInTerminal, openGwsAuthInTerminal, openClaudeLoginInTerminal, openCodexInstallInTerminal } from "@fold/connectors";
import { saveContextEvent } from "@fold/memory";
import { runTask, type FoldStateEvent, type UserActionRequest } from "@fold/runtime";
import { applyConfigToEnv, hasRealAsr, loadConfig, saveConfig, type FoldConfig } from "./config.js";
import { buildHomeSnapshot } from "./home-snapshot.js";
import { startToggleHotkey } from "./hotkey.js";
import { createTray } from "./tray.js";

applyConfigToEnv();

const contextEngine = new ContextEngine({
	onEvent: (event) => {
		try {
			saveContextEvent(event);
		} catch {
			// Raw retention should never break foreground agent execution.
		}
	},
});
let overlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let pendingHomeSection: string | null = null;
let isRecording = false;
let lastIntent = "";
let stopHotkey: (() => void) | null = null;
let pendingUserAction: {
	resolve: (optionId: string) => void;
	reject: (error: Error) => void;
	runContext?: Record<string, unknown>;
} | null = null;

function emitState(state: FoldStateEvent) {
	overlayWindow?.webContents.send("fold:state", state);
}

function createOverlayWindow() {
	const { workArea } = screen.getPrimaryDisplay();

	overlayWindow = new BrowserWindow({
		width: workArea.width,
		height: workArea.height,
		x: workArea.x,
		y: workArea.y,
		frame: false,
		transparent: true,
		alwaysOnTop: true,
		focusable: false,
		skipTaskbar: true,
		hasShadow: false,
		resizable: false,
		movable: false,
		fullscreenable: false,
		type: "panel",
		webPreferences: {
			preload: join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	overlayWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
	overlayWindow.setAlwaysOnTop(true, "floating");
	// CSS pointer-events-none is not enough — pass clicks through to apps below.
	overlayWindow.setIgnoreMouseEvents(true, { forward: true });

	if (process.env.VITE_DEV_SERVER_URL) {
		overlayWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
	} else {
		overlayWindow.loadFile(join(__dirname, "../dist/index.html"));
	}

	overlayWindow.on("closed", () => {
		overlayWindow = null;
	});

	emitState({ status: "idle" });
}

function openSettingsWindow(section?: string) {
	if (section) pendingHomeSection = section;

	if (settingsWindow) {
		settingsWindow.focus();
		if (section) {
			settingsWindow.webContents.send("fold:home-navigate", section);
		}
		return;
	}

	settingsWindow = new BrowserWindow({
		width: 920,
		height: 680,
		title: "Fold",
		resizable: true,
		minWidth: 720,
		minHeight: 520,
		show: false,
		...(process.platform === "darwin"
			? {
					frame: false,
					transparent: true,
					hasShadow: true,
					backgroundColor: "#00000000",
					// hiddenInset 仍会保留标题栏条并显示窗口标题；hidden 才彻底去掉顶栏
					titleBarStyle: "hidden" as const,
					trafficLightPosition: { x: 16, y: 16 },
				}
			: {}),
		webPreferences: {
			preload: join(__dirname, "preload.js"),
			contextIsolation: true,
			nodeIntegration: false,
		},
	});

	const settingsUrl = process.env.VITE_DEV_SERVER_URL
		? `${process.env.VITE_DEV_SERVER_URL}settings.html`
		: pathToFileURL(join(__dirname, "../dist/settings.html")).href;

	settingsWindow.loadURL(settingsUrl);
	settingsWindow.once("ready-to-show", () => {
		settingsWindow?.show();
	});
	settingsWindow.webContents.once("did-finish-load", () => {
		if (pendingHomeSection) {
			settingsWindow?.webContents.send("fold:home-navigate", pendingHomeSection);
			pendingHomeSection = null;
		}
	});
	settingsWindow.on("closed", () => {
		settingsWindow = null;
	});
}

async function runUserAction(optionId: string, context?: Record<string, unknown>) {
	switch (optionId) {
		case "gmail:terminal-auth":
			if (context?.backend === "gws") openGwsAuthInTerminal();
			else openGogAuthInTerminal();
			break;
		case "gmail:open-browser":
			await shell.openExternal("https://mail.google.com/mail/u/0/#inbox");
			break;
		case "screen:open-settings":
			await shell.openExternal(
				"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
			);
			break;
		case "cdp:open-chrome-help":
			await shell.openExternal(
				"https://developer.chrome.com/docs/devtools/remote-debugging/local-server",
			);
			break;
		case "codex:install-terminal":
			openCodexInstallInTerminal();
			break;
		case "claude:login-terminal":
			openClaudeLoginInTerminal();
			break;
		default:
			break;
	}
}

function requestUserAction(req: UserActionRequest): Promise<string> {
	return new Promise((resolve, reject) => {
		pendingUserAction = { resolve, reject, runContext: req.runContext };
		emitState({
			status: "ask",
			transcript: lastIntent,
			askTitle: req.title,
			askMessage: req.message,
			askHint: req.hint,
			askOptions: req.options,
		});
	});
}

async function executeTask(intent: string) {
	if (!intent.trim()) {
		emitState({ status: "idle" });
		return;
	}
	lastIntent = intent.trim();
	try {
		await runTask(lastIntent, emitState, {
			getLiveContext: () => contextEngine.getLiveContext(),
			requestUserAction,
			runUserAction,
		});
	} catch (err) {
		emitState({ status: "error", error: (err as Error).message });
	}
}

const IPC_HANDLE_CHANNELS = [
	"fold:get-config",
	"fold:save-config",
	"fold:get-mock-asr",
	"fold:get-home-snapshot",
	"fold:connection-action",
	"fold:run-task",
	"fold:retry-task",
	"fold:ask-response",
	"fold:dismiss",
	"fold:toggle-voice",
	"fold:voice-error",
	"fold:open-settings",
	"fold:quit",
] as const;

function registerIpc() {
	for (const channel of IPC_HANDLE_CHANNELS) {
		ipcMain.removeHandler(channel);
	}

	ipcMain.handle("fold:get-config", () => loadConfig());

	ipcMain.handle("fold:save-config", (_e, config: FoldConfig) => {
		saveConfig(config);
		applyConfigToEnv(config);
		return { ok: true };
	});

	ipcMain.handle("fold:get-mock-asr", () => !hasRealAsr());

	ipcMain.handle("fold:get-home-snapshot", () =>
		buildHomeSnapshot(() => contextEngine.getLiveContext()),
	);

	ipcMain.handle("fold:connection-action", async (_e, action: string, context?: Record<string, unknown>) => {
		await runUserAction(action, context);
		return { ok: true };
	});

	ipcMain.handle("fold:run-task", async (_e, intent: string) => {
		isRecording = false;
		await executeTask(intent);
	});

	ipcMain.handle("fold:retry-task", async () => {
		if (lastIntent) await executeTask(lastIntent);
	});

	ipcMain.handle("fold:ask-response", async (_e, optionId: string) => {
		if (pendingUserAction) {
			const pending = pendingUserAction;
			pendingUserAction = null;
			if (optionId === "cancel") {
				pending.reject(new Error("用户取消了授权"));
				return;
			}
			await runUserAction(optionId, pending.runContext);
			pending.resolve(optionId);
			return;
		}
		if (lastIntent) await executeTask(`${lastIntent} ${optionId}`);
	});

	ipcMain.on("fold:transcript-forward", (_e, text: string) => {
		emitState({ status: "listening", transcript: text });
	});

	ipcMain.on("fold:voice-level-forward", (_e, level: number) => {
		overlayWindow?.webContents.send("fold:voice-level", level);
	});

	ipcMain.on("fold:mouse-passthrough", (_e, ignore: boolean) => {
		overlayWindow?.setIgnoreMouseEvents(ignore, { forward: ignore });
	});

	ipcMain.handle("fold:dismiss", () => {
		isRecording = false;
		if (pendingUserAction) {
			pendingUserAction.reject(new Error("用户取消了授权"));
			pendingUserAction = null;
		}
		emitState({ status: "idle" });
	});

	ipcMain.handle("fold:toggle-voice", () => {
		toggleVoiceRecording();
	});

	ipcMain.handle("fold:voice-error", (_e, message: string) => {
		isRecording = false;
		emitState({ status: "error", error: message });
	});

	ipcMain.handle("fold:open-settings", (_e, section?: string) => {
		openSettingsWindow(section);
	});

	ipcMain.handle("fold:quit", () => {
		app.quit();
	});
}

registerIpc();

function toggleVoiceRecording() {
	if (isRecording) {
		isRecording = false;
		overlayWindow?.webContents.send("fold:hotkey-up");
	} else {
		isRecording = true;
		emitState({ status: "listening", transcript: "" });
		overlayWindow?.webContents.send("fold:hotkey-down");
	}
}

function registerHotkeys() {
	stopHotkey = startToggleHotkey(
		toggleVoiceRecording,
		() => {
			if (!isRecording) return;
			isRecording = false;
			overlayWindow?.webContents.send("fold:hotkey-cancel");
			emitState({ status: "idle" });
		},
	);
}

app.whenReady().then(() => {
	if (process.platform === "darwin") {
		app.dock?.hide();
	}

	contextEngine.start();
	createOverlayWindow();
	registerHotkeys();

	createTray({
		onOpenSettings: openSettingsWindow,
		onQuit: () => app.quit(),
	});
});

app.on("will-quit", () => {
	stopHotkey?.();
	contextEngine.stop();
});

app.on("window-all-closed", () => {
	// menu bar app — keep running
});

// Vite HMR can reload preload/main out of sync; re-register handles when main hot-reloads.
if (import.meta.hot) {
	import.meta.hot.accept(() => {
		if (app.isReady()) registerIpc();
	});
}
