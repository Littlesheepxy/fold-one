import { app, BrowserWindow, ipcMain, screen, shell } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ContextEngine } from "@fold/context";
import { createNangoConnectLink, openGogAuthInTerminal, openGwsAuthInTerminal, openClaudeLoginInTerminal, openCodexInstallInTerminal, openOfficeSetupInTerminal, cancelConnectFlow, pollConnectFlow, resolveConnectTarget, startConnectFlow } from "@fold/connectors";
import { saveContextEvent } from "@fold/memory";
import { runTask, structureSpeechText, type FoldStateEvent, type UserActionRequest } from "@fold/runtime";
import {
	clearPredictTargetApp,
	getPredictTargetApp,
	refreshPredictCacheEnriched,
	resolveReplyDraftsForInstruction,
	resolvePredictDraftsForIntent,
	resolveReplyPredictions,
	setPredictTargetApp,
} from "./predict-enrich.js";
import { insertTextToFrontApp } from "./insert-text.js";
import { getAppIconDataUrl, resolveAppBundlePath } from "./app-icon.js";
import { applyConfigToEnv, hasRealAsr, loadConfig, saveConfig, type FoldConfig } from "./config.js";
import { buildHomeSnapshot } from "./home-snapshot.js";
import { openAccessibilitySettings, probeAccessibility, ensureAccessibilityPermission } from "./permissions.js";
import { buildEpisodeDetail, listEpisodesForHome } from "./episode-detail.js";
import {
	buildProfilePrompt,
	copyProfilePrompt,
	executeProfileImport,
	getStoredProfile,
	listProfileImportOptions,
	saveProfileFromResponse,
} from "./profile-import.js";
import { startHoldHotkey } from "./hotkey.js";
import { createTray } from "./tray.js";
import { createFoldAppIcon } from "./tray-icon.js";

applyConfigToEnv();

const contextEngine = new ContextEngine({
	ignoreApps: ["Electron", "Fold", "fold"],
	onEvent: (event) => {
		try {
			saveContextEvent(event);
		} catch {
			// Raw retention should never break foreground agent execution.
		}
		settingsWindow?.webContents.send("fold:context-event", event);
		if (predictRefreshTimer) clearTimeout(predictRefreshTimer);
		predictRefreshTimer = setTimeout(() => {
			void refreshPredictCacheEnriched(contextEngine.getLiveContext());
		}, 4000);
	},
});
let overlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let pendingHomeSection: string | null = null;
let isRecording = false;
let voiceOutcome: "structure" | "reply" | "agent" = "structure";
let voiceTargetApp: string | null = null;
let lastIntent = "";
let stopHotkey: (() => void) | null = null;
let pendingUserAction: {
	resolve: (optionId: string) => void;
	reject: (error: Error) => void;
	runContext?: Record<string, unknown>;
} | null = null;
let predictRefreshTimer: ReturnType<typeof setTimeout> | null = null;
const appIconCache = new Map<string, string | null>();
let lastOverlayState: FoldStateEvent = { status: "idle" };

function emitState(state: FoldStateEvent) {
	lastOverlayState = { ...lastOverlayState, ...state };
	if (!overlayWindow || overlayWindow.isDestroyed()) {
		createOverlayWindow();
		return;
	}
	const { webContents } = overlayWindow;
	if (webContents.isDestroyed()) return;
	try {
		webContents.send("fold:state", state);
	} catch {
		// Overlay reload/HMR can dispose the render frame mid-task.
	}
}

function syncDockVisibility() {
	if (process.platform !== "darwin") return;
	const devMode = Boolean(process.env.VITE_DEV_SERVER_URL);
	const settingsOpen = Boolean(settingsWindow && !settingsWindow.isDestroyed());
	if (devMode || settingsOpen) {
		app.dock?.setIcon(createFoldAppIcon());
		app.dock?.show();
		return;
	}
	app.dock?.hide();
}

function createOverlayWindow() {
	if (overlayWindow && !overlayWindow.isDestroyed()) return;

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

	overlayWindow.webContents.once("did-finish-load", () => {
		emitState(lastOverlayState);
	});
}

function openSettingsWindow(section?: string) {
	if (section) pendingHomeSection = section;

	if (settingsWindow) {
		settingsWindow.focus();
		if (section) {
			settingsWindow.webContents.send("fold:home-navigate", section);
		}
		syncDockVisibility();
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
		syncDockVisibility();
	});
	settingsWindow.webContents.once("did-finish-load", () => {
		if (pendingHomeSection) {
			settingsWindow?.webContents.send("fold:home-navigate", pendingHomeSection);
			pendingHomeSection = null;
		}
	});
	settingsWindow.on("closed", () => {
		settingsWindow = null;
		syncDockVisibility();
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
		case "nango:connect": {
			const link = await createNangoConnectLink();
			await shell.openExternal(link);
			break;
		}
		case "nango:dashboard":
			await shell.openExternal("https://app.nango.dev");
			break;
		case "screen:open-settings":
			await shell.openExternal(
				"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture",
			);
			break;
		case "accessibility:request":
			void ensureAccessibilityPermission();
			break;
		case "accessibility:open-settings":
			await openAccessibilitySettings();
			break;
		case "cdp:open-chrome-help":
			await shell.openExternal(
				"https://playwright.dev/mcp/configuration/browser-extension",
			);
			break;
		case "cdp:open-remote-debugging":
			await shell.openExternal("chrome://inspect/#remote-debugging");
			break;
		case "cdp:install-bridge":
			await shell.openExternal(
				"https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm",
			);
			break;
		case "codex:install-terminal":
			openCodexInstallInTerminal();
			break;
		case "office:install-terminal":
		case "office:login-terminal": {
			const channel = typeof context?.channel === "string" ? context.channel : "";
			const kind = optionId === "office:login-terminal" ? "login" : "install";
			const result = openOfficeSetupInTerminal(channel, kind);
			if (!result.opened && result.url) await shell.openExternal(result.url);
			break;
		}
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
		emitState({ status: "idle", ...clearPredictState() });
		return;
	}
	lastIntent = intent.trim();
	emitState({ status: "understanding", ...clearPredictState() });
	try {
		await runTask(lastIntent, emitState, {
			getLiveContext: () => contextEngine.getLiveContext(),
			requestUserAction,
			runUserAction,
		});
	} catch (err) {
		emitState({ status: "error", error: (err as Error).message });
	} finally {
		void refreshPredictCacheEnriched(contextEngine.getLiveContext());
	}
}

function getCursorInOverlay(): { x: number; y: number } {
	const { workArea } = screen.getPrimaryDisplay();
	const pt = screen.getCursorScreenPoint();
	return { x: pt.x - workArea.x, y: pt.y - workArea.y };
}

function clearPredictState(): Partial<FoldStateEvent> {
	return {
		predictMode: null,
		predictPhase: null,
		predictSurface: null,
		predictAnchor: null,
		predictSuggestions: undefined,
		predictDrafts: undefined,
		predictSelectedIntent: null,
		predictDraftsLoading: false,
		predictCursor: null,
	};
}

function emitPredictResult(result: Awaited<ReturnType<typeof resolveReplyPredictions>>) {
	emitState({
		status: "predict",
		...clearPredictState(),
		predictMode: result.mode,
		predictPhase: result.phase,
		predictSurface: result.surface,
		predictAnchor: result.anchor,
		predictSuggestions: result.suggestions,
		predictDrafts: result.drafts,
		predictCursor: getCursorInOverlay(),
	});
}

function showReplyPredictions() {
	createOverlayWindow();
	emitState({
		status: "predict",
		...clearPredictState(),
		predictMode: "fast",
		predictPhase: "pick",
		predictSurface: "reply",
		predictAnchor: "正在读取对话…",
		predictSuggestions: [],
		predictCursor: getCursorInOverlay(),
	});
	void resolveReplyPredictions(contextEngine.getLiveContext()).then(emitPredictResult);
}

async function structureVoiceTranscript(transcript: string) {
	const text = transcript.trim();
	if (!text) {
		emitState({ status: "idle", ...clearPredictState() });
		return;
	}
	emitState({ status: "understanding", transcript: text, ...clearPredictState() });
	try {
		const ctx = contextEngine.getLiveContext();
		const structured = await structureSpeechText(text, {
			app: ctx.activeApp,
			windowTitle: ctx.activeWindow,
		});
		const body = [structured.headline, structured.detail]
			.map((part) => part.trim())
			.filter(Boolean)
			.filter((part, index, arr) => index === 0 || part !== arr[0])
			.join("\n\n");
		const output = body || text;
		const targetApp = voiceTargetApp ?? ctx.activeApp;
		await insertTextToFrontApp(output, targetApp);
		emitState({
			status: "done",
			transcript: text,
			result: "已输入",
			resultDetail: output,
		});
		setTimeout(() => {
			if (lastOverlayState.status === "done" && lastOverlayState.voiceMode === "structure") {
				emitState({ status: "idle", voiceMode: null, ...clearPredictState() });
			}
		}, 850);
	} catch (err) {
		emitState({ status: "error", error: (err as Error).message, transcript: text });
	} finally {
		voiceTargetApp = null;
	}
}

async function replyVoiceTranscript(transcript: string) {
	const text = transcript.trim();
	if (!text) {
		emitState({ status: "idle", ...clearPredictState() });
		return;
	}
	emitState({ status: "understanding", transcript: text, voiceMode: "reply", ...clearPredictState() });
	try {
		const ctx = contextEngine.getLiveContext();
		const drafts = await resolveReplyDraftsForInstruction(ctx, text);
		const output = drafts[0]?.text?.trim() || text;
		const targetApp = voiceTargetApp ?? ctx.activeApp;
		await insertTextToFrontApp(output, targetApp);
		emitState({
			status: "done",
			transcript: text,
			voiceMode: "reply",
			result: "已输入回复",
			resultDetail: output,
		});
		setTimeout(() => {
			if (lastOverlayState.status === "done" && lastOverlayState.voiceMode === "reply") {
				emitState({ status: "idle", voiceMode: null, ...clearPredictState() });
			}
		}, 850);
	} catch (err) {
		emitState({ status: "error", error: (err as Error).message, transcript: text });
	} finally {
		voiceTargetApp = null;
	}
}

const IPC_HANDLE_CHANNELS = [
	"fold:get-config",
	"fold:save-config",
	"fold:get-mock-asr",
	"fold:get-home-snapshot",
	"fold:get-live-context",
	"fold:get-app-icon",
	"fold:list-episodes",
	"fold:get-episode",
	"fold:connection-action",
	"fold:connect-flow-start",
	"fold:connect-flow-poll",
	"fold:connect-flow-cancel",
	"fold:open-external",
	"fold:run-task",
	"fold:structure-voice",
	"fold:reply-voice",
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

	// 轻量版实时上下文（不带连接探测），供 Home 窗口高频刷新
	ipcMain.handle("fold:get-live-context", () => {
		const ctx = contextEngine.getLiveContext();
		return {
			activeApp: ctx.activeApp,
			activeWindow: ctx.activeWindow,
			activeAppPath: ctx.activeAppPath,
			events: ctx.events.slice(-50),
		};
	});

	ipcMain.handle("fold:get-app-icon", (_e, appPath: string, appName?: string) => {
		const cacheKey = appPath?.endsWith(".app") ? appPath : `name:${appName ?? appPath}`;
		if (!cacheKey || cacheKey === "name:") return null;
		const cached = appIconCache.get(cacheKey);
		if (cached !== undefined) return cached;
		const dataUrl = getAppIconDataUrl(appPath, appName);
		appIconCache.set(cacheKey, dataUrl);
		return dataUrl;
	});

	ipcMain.handle("fold:list-episodes", () => listEpisodesForHome(50));

	ipcMain.handle("fold:get-episode", (_e, id: string) => {
		if (!id) return null;
		return buildEpisodeDetail(id);
	});

	ipcMain.handle("fold:profile-import-options", () => listProfileImportOptions());
	ipcMain.handle("fold:profile-build-prompt", () => buildProfilePrompt());
	ipcMain.handle("fold:profile-copy-prompt", () => ({ prompt: copyProfilePrompt() }));
	ipcMain.handle("fold:profile-get", () => getStoredProfile());
	ipcMain.handle("fold:profile-run-import", (_e, platformId: string, tabUrl?: string) =>
		executeProfileImport(platformId, tabUrl),
	);
	ipcMain.handle("fold:profile-save-response", (_e, responseText: string) =>
		saveProfileFromResponse(responseText),
	);

	ipcMain.handle("fold:predict-pick-intent", async (_e, intent: string) => {
		if (!intent?.trim()) return { ok: false };
		emitState({
			...lastOverlayState,
			status: "predict",
			predictDraftsLoading: true,
			predictSelectedIntent: intent.trim(),
			predictCursor: getCursorInOverlay(),
		});
		const ctx = contextEngine.getLiveContext();
		const { surface, drafts } = await resolvePredictDraftsForIntent(ctx, intent.trim());
		emitState({
			...lastOverlayState,
			status: "predict",
			predictPhase: "result",
			predictSurface: surface,
			predictSelectedIntent: intent.trim(),
			predictDrafts: drafts,
			predictDraftsLoading: false,
			predictCursor: getCursorInOverlay(),
		});
		return { ok: true };
	});

	ipcMain.handle("fold:predict-insert-draft", async (_e, text: string) => {
		const targetApp = getPredictTargetApp() ?? contextEngine.getLiveContext().activeApp;
		overlayWindow?.setIgnoreMouseEvents(true, { forward: true });
		const result = await insertTextToFrontApp(text, targetApp);
		clearPredictTargetApp();
		emitState({ status: "idle", ...clearPredictState() });
		return result;
	});

	ipcMain.handle("fold:predict-start-voice", () => {
		emitState({ status: "idle", ...clearPredictState() });
		toggleVoiceRecording();
		return { ok: true };
	});

	ipcMain.handle("fold:connection-action", async (_e, action: string, context?: Record<string, unknown>) => {
		await runUserAction(action, context);
		return { ok: true };
	});

	ipcMain.handle("fold:connect-flow-start", async (_e, connectionId: string, kind: "login" | "install") => {
		const target = resolveConnectTarget(connectionId);
		if (!target) throw new Error(`未知连接: ${connectionId}`);
		return startConnectFlow(target, kind);
	});

	ipcMain.handle("fold:connect-flow-poll", async (_e, sessionId: string) => pollConnectFlow(sessionId));

	ipcMain.handle("fold:connect-flow-cancel", async (_e, sessionId: string) => {
		cancelConnectFlow(sessionId);
		return { ok: true };
	});

	ipcMain.handle("fold:open-external", async (_e, url: string) => {
		if (typeof url === "string" && /^https?:\/\//i.test(url)) {
			await shell.openExternal(url);
		}
		return { ok: true };
	});

	ipcMain.handle("fold:run-task", async (_e, intent: string) => {
		isRecording = false;
		await executeTask(intent);
	});

	ipcMain.handle("fold:structure-voice", async (_e, transcript: string) => {
		isRecording = false;
		await structureVoiceTranscript(transcript);
	});

	ipcMain.handle("fold:reply-voice", async (_e, transcript: string) => {
		isRecording = false;
		await replyVoiceTranscript(transcript);
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
		clearPredictTargetApp();
		emitState({ status: "idle", ...clearPredictState() });
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

function toggleVoiceRecording(outcome: "structure" | "reply" | "agent" = "structure") {
	if (isRecording) {
		isRecording = false;
		overlayWindow?.webContents.send("fold:hotkey-up", voiceOutcome);
	} else {
		voiceOutcome = outcome;
		voiceTargetApp = contextEngine.getLiveContext().activeApp ?? null;
		isRecording = true;
		emitState({ status: "listening", transcript: "", voiceMode: outcome });
		overlayWindow?.webContents.send("fold:hotkey-down", outcome);
	}
}

function registerHotkeys() {
	stopHotkey = startHoldHotkey({
		onAgentToggle: () => toggleVoiceRecording("agent"),
		onStructureToggle: () => toggleVoiceRecording("structure"),
		onReply: () => toggleVoiceRecording("reply"),
		onCancel: () => {
			if (isRecording) {
				isRecording = false;
				overlayWindow?.webContents.send("fold:hotkey-cancel");
				emitState({ status: "idle", ...clearPredictState() });
				return;
			}
			if (lastOverlayState.status === "predict") {
				emitState({ status: "idle", ...clearPredictState() });
			}
		},
	});
}

app.whenReady().then(() => {
	if (process.platform === "darwin") {
		app.setName("Fold");
	}
	syncDockVisibility();

	contextEngine.start();
	createOverlayWindow();
	registerHotkeys();
	void refreshPredictCacheEnriched(contextEngine.getLiveContext());

	createTray({
		onOpenSettings: openSettingsWindow,
		onQuit: () => app.quit(),
	});

	// 未授权时弹系统对话框并打开辅助功能设置（开发模式登记为 Electron）
	setTimeout(() => void ensureAccessibilityPermission(), 1200);
});

app.on("will-quit", () => {
	stopHotkey?.();
	contextEngine.stop();
});

app.on("window-all-closed", () => {
	// menu bar app — keep running
});
