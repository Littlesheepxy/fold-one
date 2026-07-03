import { contextBridge, ipcRenderer } from "electron";

export interface FoldStateEvent {
	status: string;
	transcript?: string;
	steps?: Array<{ id: string; label: string; status: string }>;
	currentApp?: string | null;
	result?: string | null;
	error?: string | null;
	askOptions?: Array<{ id: string; label: string }>;
}

contextBridge.exposeInMainWorld("fold", {
	onState(cb: (state: FoldStateEvent) => void) {
		const handler = (_: unknown, state: FoldStateEvent) => cb(state);
		ipcRenderer.on("fold:state", handler);
		return () => ipcRenderer.removeListener("fold:state", handler);
	},
	onTranscript(cb: (text: string) => void) {
		const handler = (_: unknown, text: string) => cb(text);
		ipcRenderer.on("fold:transcript", handler);
		return () => ipcRenderer.removeListener("fold:transcript", handler);
	},
	onVoiceLevel(cb: (level: number) => void) {
		const handler = (_: unknown, level: number) => cb(level);
		ipcRenderer.on("fold:voice-level", handler);
		return () => ipcRenderer.removeListener("fold:voice-level", handler);
	},
	getUseMockAsr: () => ipcRenderer.invoke("fold:get-mock-asr") as Promise<boolean>,
	runTask: (intent: string) => ipcRenderer.invoke("fold:run-task", intent) as Promise<void>,
	retryTask: () => ipcRenderer.invoke("fold:retry-task") as Promise<void>,
	askResponse: (optionId: string) =>
		ipcRenderer.invoke("fold:ask-response", optionId) as Promise<void>,
	getConfig: () => ipcRenderer.invoke("fold:get-config") as Promise<Record<string, unknown>>,
	getHomeSnapshot: () => ipcRenderer.invoke("fold:get-home-snapshot") as Promise<Record<string, unknown>>,
	getLiveContext: () => ipcRenderer.invoke("fold:get-live-context") as Promise<Record<string, unknown>>,
	getAppIcon: (appPath: string, appName?: string) =>
		ipcRenderer.invoke("fold:get-app-icon", appPath, appName) as Promise<string | null>,
	listEpisodes: () => ipcRenderer.invoke("fold:list-episodes") as Promise<Record<string, unknown>[]>,
	getEpisode: (id: string) =>
		ipcRenderer.invoke("fold:get-episode", id) as Promise<Record<string, unknown> | null>,
	predictPickIntent: (intent: string) =>
		ipcRenderer.invoke("fold:predict-pick-intent", intent) as Promise<{ ok: boolean }>,
	predictInsertDraft: (text: string) =>
		ipcRenderer.invoke("fold:predict-insert-draft", text) as Promise<{ ok: boolean; pasted: boolean }>,
	predictStartVoice: () =>
		ipcRenderer.invoke("fold:predict-start-voice") as Promise<{ ok: boolean }>,
	profileImportOptions: () =>
		ipcRenderer.invoke("fold:profile-import-options") as Promise<
			Array<{
				id: string;
				label: string;
				hasOpenTab: boolean;
				tabUrl?: string;
				tabTitle?: string;
				defaultUrl: string;
				automationSupported: boolean;
			}>
		>,
	profileBuildPrompt: () => ipcRenderer.invoke("fold:profile-build-prompt") as Promise<string>,
	profileCopyPrompt: () =>
		ipcRenderer.invoke("fold:profile-copy-prompt") as Promise<{ prompt: string }>,
	profileGet: () => ipcRenderer.invoke("fold:profile-get") as Promise<Record<string, unknown> | null>,
	profileRunImport: (platformId: string, tabUrl?: string) =>
		ipcRenderer.invoke("fold:profile-run-import", platformId, tabUrl) as Promise<{
			ok: boolean;
			response?: string;
			error?: string;
			prompt: string;
		}>,
	profileSaveResponse: (responseText: string) =>
		ipcRenderer.invoke("fold:profile-save-response", responseText) as Promise<{
			ok: boolean;
			error?: string;
			profile?: Record<string, unknown>;
		}>,
	onContextEvent(cb: (event: Record<string, unknown>) => void) {
		const handler = (_: unknown, event: Record<string, unknown>) => cb(event);
		ipcRenderer.on("fold:context-event", handler);
		return () => ipcRenderer.removeListener("fold:context-event", handler);
	},
	runConnectionAction: (action: string, context?: Record<string, unknown>) =>
		ipcRenderer.invoke("fold:connection-action", action, context) as Promise<{ ok: boolean }>,
	startConnectFlow: (connectionId: string, kind: "login" | "install") =>
		ipcRenderer.invoke("fold:connect-flow-start", connectionId, kind) as Promise<{
			sessionId: string;
			title: string;
			message: string;
			authUrl?: string;
			userCode?: string;
			opensBrowserAutomatically?: boolean;
		}>,
	pollConnectFlow: (sessionId: string) =>
		ipcRenderer.invoke("fold:connect-flow-poll", sessionId) as Promise<{
			status: "pending" | "success" | "error";
			message?: string;
			error?: string;
		}>,
	cancelConnectFlow: (sessionId: string) =>
		ipcRenderer.invoke("fold:connect-flow-cancel", sessionId) as Promise<{ ok: boolean }>,
	openExternal: (url: string) => ipcRenderer.invoke("fold:open-external", url) as Promise<{ ok: boolean }>,
	saveConfig: (config: Record<string, unknown>) =>
		ipcRenderer.invoke("fold:save-config", config) as Promise<{ ok: boolean }>,
	setMousePassthrough: (ignore: boolean) => {
		ipcRenderer.send("fold:mouse-passthrough", ignore);
	},
	dismiss: () => ipcRenderer.invoke("fold:dismiss") as Promise<void>,
	toggleVoice: () => ipcRenderer.invoke("fold:toggle-voice") as Promise<void>,
	voiceError: (message: string) => ipcRenderer.invoke("fold:voice-error", message) as Promise<void>,
	openSettings: (section?: string) =>
		ipcRenderer.invoke("fold:open-settings", section) as Promise<void>,
	quit: () => ipcRenderer.invoke("fold:quit") as Promise<void>,
	onHotkeyDown(cb: () => void) {
		const handler = () => cb();
		ipcRenderer.on("fold:hotkey-down", handler);
		return () => ipcRenderer.removeListener("fold:hotkey-down", handler);
	},
	onHotkeyUp(cb: () => void) {
		const handler = () => cb();
		ipcRenderer.on("fold:hotkey-up", handler);
		return () => ipcRenderer.removeListener("fold:hotkey-up", handler);
	},
	onHotkeyCancel(cb: () => void) {
		const handler = () => cb();
		ipcRenderer.on("fold:hotkey-cancel", handler);
		return () => ipcRenderer.removeListener("fold:hotkey-cancel", handler);
	},
	onHomeNavigate(cb: (section: string) => void) {
		const handler = (_: unknown, section: string) => cb(section);
		ipcRenderer.on("fold:home-navigate", handler);
		return () => ipcRenderer.removeListener("fold:home-navigate", handler);
	},
});
