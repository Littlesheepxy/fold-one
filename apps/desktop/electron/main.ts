import { app, BrowserWindow, clipboard, dialog, ipcMain, screen, shell } from "electron";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { ContextEngine, isClipboardRecallIntent, resolveClipboardRecall, type ContextEvent } from "@fold/context";
import { createNangoConnectLink, openGogAuthInTerminal, openGwsAuthInTerminal, openClaudeLoginInTerminal, openCodexInstallInTerminal, openOfficeSetupInTerminal, openWorkBuddyApp, activateWorkBuddyConnectFlow, cancelConnectFlow, pollConnectFlow, resolveConnectTarget, startConnectFlow } from "@fold/connectors";
import { saveContextEvent, listContextEvents, saveVoiceInteraction } from "@fold/memory";
import {
	hasPlannerApiKey,
	recallHabitsFromUsage,
	resolveEntitlements,
	runTask,
	shouldCleanSpeechLocally,
	startHabitRecallLoop,
	structureSpeechText,
	type FoldStateEvent,
	type UserActionRequest,
} from "@fold/runtime";
import {
	clearPredictTargetApp,
	getPredictTargetApp,
	getPredictPreviewForHome,
	resolveAhaGuess,
	streamAhaGuessForHome,
	refreshPredictCacheEnriched,
	resolveReplyDraftsForInstruction,
	resolveReplyVoiceCard,
	resolvePredictDraftsForIntent,
	resolveReplyPredictions,
	setPredictTargetApp,
} from "./predict-enrich.js";
import { insertTextToFrontApp } from "./insert-text.js";
import { buildVoiceOverlayContext } from "./voice-overlay-context.js";
import { focusApp, focusUrl } from "./focus-context.js";
import { getAppIconDataUrl, getFirstAppIconDataUrl, resolveAppBundlePath } from "./app-icon.js";
import {
	applyConfigToEnv,
	consumeSmartActionTrial,
	hasRealAsr,
	loadConfig,
	resolveSmartActionAccess,
	saveConfig,
	type FoldConfig,
} from "./config.js";
import { buildHomeSnapshot } from "./home-snapshot.js";
import { cursorPointInOverlay, getOverlaySpanBounds, positionOverlayForActiveContext } from "./overlay-display.js";
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
import { migrateLegacyDataDir } from "./data-dir.js";
import { PRODUCT_NAME } from "./brand.js";
import { createZhigengAppIcon } from "./tray-icon.js";
import {
	appendLocalWhisperAudio,
	cancelLocalWhisperSession,
	finishLocalWhisperSession,
	getDefaultLocalModelPath,
	hasLocalWhisperModel,
	resolveLocalModelPath,
	startLocalWhisperSession,
} from "./local-whisper.js";
import { downloadVoicePack, getVoiceSetupStatus } from "./voice-setup.js";
import { scanInputHabits, listInstalledInputMethods } from "./input-habit-scanner/index.js";
import { exportInputHabitsToRime } from "./input-habit-scanner/export-rime.js";
import {
	importInputHabitsOneClick,
	loadImportedInputHabits,
} from "./input-habit-scanner/import.js";

migrateLegacyDataDir();
applyConfigToEnv();

const contextEngine = new ContextEngine({
	ignoreApps: ["Electron", "Fold", "fold", "知更", "Zhigeng", "zhigeng"],
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

function hydrateContextFromDb() {
	try {
		const rows = listContextEvents(400);
		if (!rows.length) return;
		const events: ContextEvent[] = rows.map((row) => ({
			id: row.id,
			type: row.type as ContextEvent["type"],
			source: row.source as ContextEvent["source"],
			timestamp: row.timestamp,
			data: {
				appName: typeof row.data.appName === "string" ? row.data.appName : undefined,
				windowTitle:
					typeof row.data.windowTitle === "string" ? row.data.windowTitle : undefined,
				appPath: typeof row.data.appPath === "string" ? row.data.appPath : undefined,
				filePath: typeof row.data.filePath === "string" ? row.data.filePath : undefined,
				url: typeof row.data.url === "string" ? row.data.url : undefined,
				text: typeof row.data.text === "string" ? row.data.text : undefined,
				origin:
					row.data.origin === "fold" || row.data.origin === "user"
						? row.data.origin
						: undefined,
			},
		}));
		contextEngine.hydrate(events);
	} catch {
		// DB hydration should never block startup.
	}
}

let overlayWindow: BrowserWindow | null = null;
let settingsWindow: BrowserWindow | null = null;
let pendingHomeSection: string | null = null;
let isRecording = false;
let voiceOutcome: "structure" | "reply" | "agent" = "structure";
/** 代回首轮：松开右 ⌘ 不结束，短按结束 */
let replyLatched = false;
/** 确认卡上按住修改：松开结束 */
let replyRefineHold = false;
let voiceTargetApp: string | null = null;
let lastIntent = "";
let lastReplyTranscript = "";
let stopHotkey: (() => void) | null = null;
let stopHabitRecall: (() => void) | null = null;

function snapshotContextEvents() {
	return contextEngine.getLiveContext().events.slice(-24).map((e) => ({
		type: e.type,
		source: e.source,
		data: e.data as Record<string, unknown>,
	}));
}

function recordVoiceInteraction(
	kind: "structure" | "reply" | "agent",
	transcript: string,
	outcome?: string,
) {
	const ctx = contextEngine.getLiveContext();
	try {
		saveVoiceInteraction({
			kind,
			transcript,
			outcome,
			appName: ctx.activeApp,
			windowTitle: ctx.activeWindow,
			contextEvents: snapshotContextEvents(),
		});
		recallHabitsFromUsage();
	} catch {
		// Habit learning should never block voice flows.
	}
}
let pendingUserAction: {
	resolve: (optionId: string) => void;
	reject: (error: Error) => void;
	runContext?: Record<string, unknown>;
} | null = null;
let predictRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let ahaGuessRunId = 0;
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
		app.dock?.setIcon(createZhigengAppIcon());
		app.dock?.show();
		return;
	}
	app.dock?.hide();
}

function createOverlayWindow() {
	if (overlayWindow && !overlayWindow.isDestroyed()) return;

	const span = getOverlaySpanBounds();

	overlayWindow = new BrowserWindow({
		width: span.width,
		height: span.height,
		x: span.x,
		y: span.y,
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
		const app = contextEngine.getLiveContext().activeApp;
		void positionOverlayForActiveContext(overlayWindow, app).then((voiceTabPlacement) => {
			emitState({ ...lastOverlayState, voiceTabPlacement });
		});
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
		width: 1120,
		height: 780,
		title: PRODUCT_NAME,
		resizable: true,
		minWidth: 880,
		minHeight: 640,
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
		case "workbuddy:open-app":
			openWorkBuddyApp();
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
	const smartAccess = resolveSmartActionAccess();
	if (!smartAccess.allowed && !hasPlannerApiKey()) {
		emitState({
			status: "error",
			transcript: lastIntent,
			error: "智能体验次数已用完。可升级版本，或在设置中启用 BYOK 使用自己的模型。",
		});
		return;
	}
	if (!smartAccess.allowed) {
		emitState({
			status: "error",
			transcript: lastIntent,
			error: "智能体验次数已用完。启用 BYOK 后可继续使用你配置的 Planner。",
		});
		return;
	}
	emitState({ status: "understanding", ...clearPredictState() });
	try {
		await runTask(lastIntent, emitState, {
			getLiveContext: () => contextEngine.getLiveContext(),
			requestUserAction,
			runUserAction,
		});
		if (smartAccess.usesTrial && hasPlannerApiKey()) consumeSmartActionTrial();
	} catch (err) {
		emitState({ status: "error", error: (err as Error).message });
	} finally {
		void refreshPredictCacheEnriched(contextEngine.getLiveContext());
	}
}

function getCursorInOverlay(): { x: number; y: number } {
	return cursorPointInOverlay(overlayWindow);
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
		contextPageUrl: null,
		contextPageLabel: null,
		predictRefining: false,
		voiceTabPlacement: null,
		structureDraftOpen: false,
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
	const ctx = contextEngine.getLiveContext();
	const targetApp = ctx.activeApp;
	void contextEngine.refreshActiveApp().then(async () => {
		const fresh = contextEngine.getLiveContext();
		const app = fresh.activeApp ?? targetApp;
		const voiceTabPlacement = await positionOverlayForActiveContext(overlayWindow, app);
		emitState({
			status: "predict",
			...clearPredictState(),
			predictMode: "fast",
			predictPhase: "pick",
			predictSurface: "reply",
			predictAnchor: "正在读取对话…",
			predictSuggestions: [],
			predictCursor: getCursorInOverlay(),
			voiceTabPlacement,
			contextAppName: app,
			contextAppPath: fresh.activeAppPath,
		});
		const result = await resolveReplyPredictions(fresh, app);
		const placement = await positionOverlayForActiveContext(overlayWindow, app);
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
			voiceTabPlacement: placement,
			contextAppName: app,
			contextAppPath: fresh.activeAppPath,
			contextWindowTitle: result.anchor,
		});
	});
}

async function structureVoiceTranscript(transcript: string) {
	const text = transcript.trim();
	if (!text) {
		emitState({ status: "idle", ...clearPredictState() });
		return;
	}
	const ctx = contextEngine.getLiveContext();
	const smartAccess = resolveSmartActionAccess();
	const useLocal = shouldCleanSpeechLocally(text);
	const voiceTabPlacement = await positionOverlayForActiveContext(
		overlayWindow,
		voiceTargetApp ?? ctx.activeApp,
	);
	emitState({
		status: "formatting",
		transcript: text,
		voiceMode: "structure",
		voiceTabPlacement,
		...clearPredictState(),
		...buildVoiceOverlayContext(ctx),
	});
	try {
		if (isClipboardRecallIntent(text)) {
			const recall = resolveClipboardRecall(text, ctx.recentClipboards ?? []);
			recordVoiceInteraction("structure", text, recall.summary);
			emitState({
				status: "done",
				transcript: text,
				voiceMode: "structure",
				result: recall.ok ? "已找到复制记录" : "未找到复制记录",
				resultDetail: recall.summary,
			});
			setTimeout(() => {
				if (lastOverlayState.status === "done" && lastOverlayState.voiceMode === "structure") {
					emitState({ status: "idle", voiceMode: null, ...clearPredictState() });
				}
			}, 2500);
			return;
		}

		const [structured] = await Promise.all([
			structureSpeechText(text, {
				app: ctx.activeApp,
				windowTitle: ctx.activeWindow,
				allowCloud: useLocal ? false : smartAccess.allowed,
				onCloudSuccess: smartAccess.usesTrial
					? () => {
							consumeSmartActionTrial();
						}
					: undefined,
			}),
			useLocal ? new Promise((r) => setTimeout(r, 240)) : Promise.resolve(),
		]);
		const body = [structured.headline, structured.detail]
			.map((part) => part.trim())
			.filter(Boolean)
			.filter((part, index, arr) => index === 0 || part !== arr[0])
			.join("\n\n");
		const output = body || text;
		const targetApp = voiceTargetApp ?? ctx.activeApp;
		const autoInsert = loadConfig().structureAutoInsert !== false;
		recordVoiceInteraction("structure", text, output);

		if (autoInsert) {
			contextEngine.suppressClipboardCapture(5000);
			await insertTextToFrontApp(output, targetApp);
			emitState({
				status: "done",
				transcript: text,
				voiceMode: "structure",
				result: "已输入",
				resultDetail: output,
				voiceTabPlacement,
				structureDraftOpen: false,
			});
			setTimeout(() => {
				if (lastOverlayState.status === "done" && lastOverlayState.voiceMode === "structure") {
					emitState({ status: "idle", voiceMode: null, ...clearPredictState() });
				}
			}, 850);
		} else {
			emitState({
				status: "done",
				transcript: text,
				voiceMode: "structure",
				result: "转写完成",
				resultDetail: output,
				voiceTabPlacement,
				structureDraftOpen: true,
				...buildVoiceOverlayContext(ctx),
			});
		}
	} catch (err) {
		emitState({ status: "error", error: (err as Error).message, transcript: text });
	} finally {
		if (loadConfig().structureAutoInsert !== false) {
			voiceTargetApp = null;
		}
	}
}

async function replyVoiceTranscript(transcript: string) {
	const text = transcript.trim();
	if (!text) {
		emitState({ status: "idle", ...clearPredictState() });
		return;
	}
	lastReplyTranscript = text;

	await contextEngine.refreshActiveApp();
	const ctx = contextEngine.getLiveContext();
	const contextAppName = voiceTargetApp ?? ctx.activeApp;
	const contextAppPath = ctx.activeAppPath;

	createOverlayWindow();
	const voiceTabPlacement = await positionOverlayForActiveContext(overlayWindow, contextAppName);
	emitState({
		status: "predict",
		voiceMode: null,
		voiceTabPlacement,
		...clearPredictState(),
		predictMode: "full",
		predictPhase: "result",
		predictSurface: "reply",
		predictAnchor: "正在生成回复…",
		predictSelectedIntent: text,
		predictDraftsLoading: true,
		predictRefining: false,
		predictCursor: getCursorInOverlay(),
		contextAppName,
		contextAppPath,
		contextWindowTitle: ctx.activeWindow,
	});

	try {
		const card = await resolveReplyVoiceCard(ctx, text, contextAppName);
		recordVoiceInteraction("reply", text, card.drafts[0]?.text);
		emitState({
			status: "predict",
			voiceMode: null,
			voiceTabPlacement,
			predictMode: "full",
			predictPhase: "result",
			predictSurface: "reply",
			predictAnchor: card.sceneTitle,
			predictSelectedIntent: text,
			predictDrafts: card.drafts,
			predictDraftsLoading: false,
			predictRefining: false,
			predictCursor: getCursorInOverlay(),
			contextAppName: card.appName ?? contextAppName,
			contextAppPath: card.appPath ?? contextAppPath,
			contextWindowTitle: card.sceneTitle,
		});
	} catch (err) {
		emitState({
			status: "error",
			error: (err as Error).message,
			transcript: text,
			...clearPredictState(),
		});
	} finally {
		voiceTargetApp = null;
	}
}

const IPC_HANDLE_CHANNELS = [
	"fold:get-config",
	"fold:save-config",
	"fold:get-mock-asr",
	"fold:get-asr-runtime",
	"fold:get-voice-setup",
	"fold:download-voice-pack",
	"fold:local-asr-start",
	"fold:local-asr-finish",
	"fold:local-asr-cancel",
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

function resolveAsrRuntime() {
	const config = loadConfig();
	const requested = config.asrProvider ?? "auto";
	const modelPath =
		config.localWhisperModelPath ?? getDefaultLocalModelPath();
	const resolvedModelPath = resolveLocalModelPath(modelPath);
	const hasLocal = hasLocalWhisperModel(modelPath);
	const hasCloud = hasRealAsr(config);
	const tier = resolveEntitlements(config.planTier);

	if (requested === "local-whisper" || requested === "local-funasr") {
		return { provider: "local-whisper" as const, modelPath: resolvedModelPath, ready: hasLocal };
	}
	if (requested === "dashscope") {
		return {
			provider: hasCloud ? ("dashscope" as const) : ("mock" as const),
			ready: hasCloud,
		};
	}
	// 会员版：自动走云端
	if (tier.cloudAsr) {
		return {
			provider: hasCloud ? ("dashscope" as const) : ("dashscope" as const),
			ready: hasCloud,
		};
	}
	// 免费版：仅本地语音包
	if (hasLocal) {
		return { provider: "local-whisper" as const, modelPath: resolvedModelPath, ready: true };
	}
	return { provider: "local-whisper" as const, modelPath: resolvedModelPath, ready: false };
}

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

	ipcMain.handle("fold:get-mock-asr", () => resolveAsrRuntime().provider === "mock");

	ipcMain.handle("fold:get-voice-setup", () => getVoiceSetupStatus());

	ipcMain.handle("fold:download-voice-pack", () => downloadVoicePack());

	ipcMain.handle("fold:get-asr-runtime", resolveAsrRuntime);

	ipcMain.handle("fold:local-asr-start", () => {
		startLocalWhisperSession();
		return { ok: true };
	});

	ipcMain.removeAllListeners("fold:local-asr-audio");
	ipcMain.on("fold:local-asr-audio", (_event, chunk: ArrayBuffer | Uint8Array) => {
		appendLocalWhisperAudio(chunk);
	});

	ipcMain.handle("fold:local-asr-finish", async () => {
		const config = loadConfig();
		return finishLocalWhisperSession(
			resolveLocalModelPath(config.localWhisperModelPath),
		);
	});

	ipcMain.handle("fold:local-asr-cancel", () => {
		cancelLocalWhisperSession();
		return { ok: true };
	});

	ipcMain.handle("fold:get-home-snapshot", () =>
		buildHomeSnapshot(() => contextEngine.getLiveContext()),
	);

	ipcMain.handle("fold:get-predict-preview", () =>
		getPredictPreviewForHome(contextEngine.getLiveContext()),
	);

	ipcMain.handle("fold:start-aha-guess", async () => {
		const runId = ++ahaGuessRunId;
		const win = settingsWindow;
		if (!win || win.isDestroyed()) return { ok: false };

		const send = (channel: string, payload: Record<string, unknown>) => {
			if (runId !== ahaGuessRunId || win.isDestroyed()) return;
			win.webContents.send(channel, { runId, ...payload });
		};

		void (async () => {
			try {
				const result = await streamAhaGuessForHome(
					contextEngine.getLiveContext(),
					undefined,
					(chunk) => send("fold:aha-guess-chunk", { chunk }),
					() => runId !== ahaGuessRunId,
				);
				if (runId !== ahaGuessRunId) return;
				send("fold:aha-guess-done", {
					suggestions: result.suggestions,
					reply: result.reply,
					confidenceLevel: result.confidenceLevel,
					confidenceScore: result.confidenceScore,
				});
			} catch {
				if (runId !== ahaGuessRunId) return;
				send("fold:aha-guess-done", {
					error: "暂时没看清楚，稍后再试。",
					suggestions: [],
				});
			}
		})();

		return { ok: true, runId };
	});

	ipcMain.handle("fold:cancel-aha-guess", () => {
		ahaGuessRunId += 1;
		return { ok: true };
	});

	// 轻量版实时上下文（不带连接探测），供 Home 窗口高频刷新
	ipcMain.handle("fold:get-live-context", () => {
		const ctx = contextEngine.getLiveContext();
		return {
			activeApp: ctx.activeApp,
			activeWindow: ctx.activeWindow,
			activeAppPath: ctx.activeAppPath,
			recentUrls: ctx.recentUrls.slice(0, 10).map((u) => ({
				url: u.url,
				title: u.title,
			})),
			recentFiles: ctx.recentFiles.slice(0, 10).map((f) => ({
				path: f.path,
				name: f.name,
			})),
			clipboardPreview: ctx.clipboard?.text
				? ctx.clipboard.text.slice(0, 80) + (ctx.clipboard.text.length > 80 ? "…" : "")
				: null,
			recentClipboards: ctx.recentClipboards.slice(0, 50).map((item) => ({
				id: item.id,
				timestamp: item.timestamp,
				text: item.text,
				appName: item.appName,
				windowTitle: item.windowTitle,
				appPath: item.appPath,
			})),
			focusDwells: (ctx.focusDwells ?? []).slice(0, 6).map((d) => ({
				app: d.app,
				windowTitle: d.windowTitle,
				dwellMs: d.dwellMs,
			})),
			events: ctx.events.slice(-80),
		};
	});

	ipcMain.handle("fold:restore-clipboard", async (_e, payload: { id?: string; text?: string }) => {
		const id = typeof payload?.id === "string" ? payload.id : "";
		const directText = typeof payload?.text === "string" ? payload.text.trim() : "";
		const ctx = contextEngine.getLiveContext();
		const entry =
			(id ? ctx.recentClipboards.find((item) => item.id === id) : null) ??
			(directText
				? {
						id: "direct",
						text: directText,
						timestamp: Date.now(),
						appName: null,
						windowTitle: null,
						appPath: null,
					}
				: null);
		if (!entry?.text) return { ok: false };
		const { clipboard } = await import("electron");
		contextEngine.suppressClipboardCapture(2500);
		clipboard.writeText(entry.text);
		return { ok: true };
	});

	ipcMain.handle(
		"fold:focus-context",
		async (_e, target: { kind: "app"; appName: string } | { kind: "url"; url: string }) => {
			if (target?.kind === "app") return focusApp(target.appName);
			if (target?.kind === "url") return focusUrl(target.url);
			return { ok: false };
		},
	);

	ipcMain.handle("fold:get-app-icon", (_e, appPath: string, appName?: string) => {
		const cacheKey = appPath?.endsWith(".app") ? appPath : `name:${appName ?? appPath}`;
		if (!cacheKey || cacheKey === "name:") return null;
		const cached = appIconCache.get(cacheKey);
		if (cached !== undefined) return cached;
		const dataUrl = getAppIconDataUrl(appPath, appName);
		appIconCache.set(cacheKey, dataUrl);
		return dataUrl;
	});

	ipcMain.handle("fold:get-first-app-icon", (_e, appNames: string[]) => {
		const key = `names:${appNames.join("|")}`;
		if (!appNames.length) return null;
		const cached = appIconCache.get(key);
		if (cached !== undefined) return cached;
		const dataUrl = getFirstAppIconDataUrl(appNames);
		appIconCache.set(key, dataUrl);
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
		contextEngine.suppressClipboardCapture(5000);
		const result = await insertTextToFrontApp(text, targetApp);
		if (lastReplyTranscript.trim()) {
			recordVoiceInteraction("reply", lastReplyTranscript, text);
		}
		lastReplyTranscript = "";
		clearPredictTargetApp();
		emitState({ status: "idle", ...clearPredictState() });
		return result;
	});

	ipcMain.handle(
		"fold:structure-insert-draft",
		async (_e, text: string, targetAppName?: string | null) => {
			const trimmed = String(text ?? "").trim();
			if (!trimmed) return { ok: false, pasted: false };
			await contextEngine.refreshActiveApp();
			const targetApp =
				String(targetAppName ?? "").trim() ||
				voiceTargetApp ||
				contextEngine.getLiveContext().activeApp;
			overlayWindow?.setIgnoreMouseEvents(true, { forward: true });
			contextEngine.suppressClipboardCapture(5000);
			const result = await insertTextToFrontApp(trimmed, targetApp);
			voiceTargetApp = null;
			emitState({ status: "idle", voiceMode: null, ...clearPredictState() });
			return result;
		},
	);

	ipcMain.handle("fold:copy-text", (_e, text: string) => {
		const trimmed = String(text ?? "").trim();
		if (!trimmed) return { ok: false };
		clipboard.writeText(trimmed);
		return { ok: true };
	});

	ipcMain.handle("fold:predict-start-voice", () => {
		emitState({ status: "idle", ...clearPredictState() });
		toggleVoiceRecording("structure");
		return { ok: true };
	});

	ipcMain.handle("fold:predict-refine-voice", () => {
		if (!isReplyPredictCard()) return { ok: false };
		startReplyRefineRecording();
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

	ipcMain.handle("fold:connect-flow-activate-workbuddy", async (_e, sessionId: string) => {
		if (typeof sessionId !== "string" || !sessionId) {
			return { ok: false, opened: false };
		}
		const result = activateWorkBuddyConnectFlow(sessionId);
		return { ok: true, opened: result.opened, url: result.url };
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
		voiceTargetApp = null;
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

	ipcMain.handle("fold:scan-input-habits", () => scanInputHabits());
	ipcMain.handle("fold:list-installed-input-methods", () => listInstalledInputMethods());

	ipcMain.handle("fold:import-input-habits", () => importInputHabitsOneClick());
	ipcMain.handle("fold:get-imported-input-habits", () => loadImportedInputHabits());
	ipcMain.handle("fold:export-input-habits-rime", async () => {
		const { canceled, filePaths } = await dialog.showOpenDialog({
			title: "选择搜狗词库备份（偏好设置 → 词库 → 导出）",
			filters: [{ name: "搜狗词库备份", extensions: ["bin"] }],
			properties: ["openFile"],
		});
		if (canceled || !filePaths[0]) return { canceled: true as const };
		return exportInputHabitsToRime({ sogouBinPath: filePaths[0] });
	});

	ipcMain.handle("fold:quit", () => {
		app.quit();
	});
}

registerIpc();

async function startVoiceRecording(outcome: "structure" | "reply" | "agent") {
	if (isRecording) return;
	await contextEngine.refreshActiveApp();
	voiceOutcome = outcome;
	const ctx = contextEngine.getLiveContext();
	voiceTargetApp = ctx.activeApp ?? null;
	isRecording = true;
	createOverlayWindow();
	const voiceTabPlacement = await positionOverlayForActiveContext(overlayWindow, voiceTargetApp);
	emitState({
		status: "listening",
		transcript: "",
		result: null,
		resultDetail: null,
		voiceMode: outcome,
		voiceTabPlacement,
		predictRefining: false,
		...clearPredictState(),
		...buildVoiceOverlayContext(ctx),
	});
	overlayWindow?.webContents.send("fold:hotkey-down", outcome);
}

function startReplyLatchedRecording() {
	replyLatched = true;
	replyRefineHold = false;
	startVoiceRecording("reply");
}

function startReplyRefineRecording() {
	if (isRecording) return;
	replyLatched = false;
	replyRefineHold = true;
	voiceOutcome = "reply";
	isRecording = true;
	createOverlayWindow();
	const app = voiceTargetApp ?? contextEngine.getLiveContext().activeApp;
	void positionOverlayForActiveContext(overlayWindow, app).then((voiceTabPlacement) => {
		emitState({
			...lastOverlayState,
			status: "predict",
			voiceMode: "reply",
			predictRefining: true,
			predictDraftsLoading: false,
			voiceTabPlacement,
		});
	});
	overlayWindow?.webContents.send("fold:hotkey-down", "reply");
}

function stopVoiceRecording() {
	if (!isRecording) return;
	isRecording = false;
	replyLatched = false;
	replyRefineHold = false;
	overlayWindow?.webContents.send("fold:hotkey-up", voiceOutcome);
}

function toggleVoiceRecording(outcome: "structure" | "reply" | "agent" = "structure") {
	if (isRecording) stopVoiceRecording();
	else startVoiceRecording(outcome);
}

function isReplyPredictCard(): boolean {
	return lastOverlayState.status === "predict" && lastOverlayState.predictSurface === "reply";
}

function cancelActiveSession() {
	replyLatched = false;
	replyRefineHold = false;
	if (isRecording) {
		isRecording = false;
		overlayWindow?.webContents.send("fold:hotkey-cancel");
		emitState({ status: "idle", ...clearPredictState() });
		return;
	}
	if (lastOverlayState.status === "predict") {
		emitState({ status: "idle", ...clearPredictState() });
	}
}

function registerHotkeys() {
	stopHotkey = startHoldHotkey({
		onAgentToggle: () => toggleVoiceRecording("agent"),
		onStructureToggle: () => {
			if (isRecording && voiceOutcome === "reply" && replyLatched) {
				stopVoiceRecording();
				return;
			}
			if (isRecording && voiceOutcome === "reply") return;
			toggleVoiceRecording("structure");
		},
		onReplyHoldStart: () => {
			if (isReplyPredictCard() && !isRecording) {
				startReplyRefineRecording();
				return;
			}
			if (isRecording && voiceOutcome === "structure") {
				isRecording = false;
				overlayWindow?.webContents.send("fold:hotkey-cancel");
			}
			if (!isRecording) startReplyLatchedRecording();
		},
		onReplyHoldEnd: () => {
			if (isRecording && voiceOutcome === "reply" && replyRefineHold) {
				stopVoiceRecording();
			}
		},
		onReplyToggle: () => toggleVoiceRecording("reply"),
		onCancel: cancelActiveSession,
	});
}

app.whenReady().then(() => {
	if (process.platform === "darwin") {
		app.setName(PRODUCT_NAME);
	}
	syncDockVisibility();

	contextEngine.start();
	hydrateContextFromDb();
	stopHabitRecall = startHabitRecallLoop(() => recallHabitsFromUsage());
	createOverlayWindow();
	registerHotkeys();
	void refreshPredictCacheEnriched(contextEngine.getLiveContext());

	createTray({
		onVoiceStructure: () => toggleVoiceRecording("structure"),
		onReplyPredict: () => showReplyPredictions(),
		onVoiceAgent: () => toggleVoiceRecording("agent"),
		onCancel: cancelActiveSession,
		onOpenSettings: openSettingsWindow,
		onQuit: () => app.quit(),
		getSessionState: () => ({
			recording: isRecording,
			predicting: lastOverlayState.status === "predict",
		}),
	});

	// 未授权时弹系统对话框并打开辅助功能设置（开发模式登记为 Electron）
	setTimeout(() => void ensureAccessibilityPermission(), 1200);
});

app.on("will-quit", () => {
	stopHotkey?.();
	stopHabitRecall?.();
	contextEngine.stop();
});

app.on("window-all-closed", () => {
	// menu bar app — keep running
});
