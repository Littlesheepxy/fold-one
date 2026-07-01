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
	runConnectionAction: (action: string, context?: Record<string, unknown>) =>
		ipcRenderer.invoke("fold:connection-action", action, context) as Promise<{ ok: boolean }>,
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
