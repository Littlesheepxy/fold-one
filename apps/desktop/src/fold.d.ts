import type { FoldStateEvent } from "@fold/runtime";
import type { FoldConfig, EpisodeDetail, EpisodeSummary, HomeContextEvent, HomeSnapshot, LiveContextLite } from "./settings/types.js";

interface FoldApi {
	onState(cb: (state: FoldStateEvent) => void): () => void;
	onTranscript(cb: (text: string) => void): () => void;
	onVoiceLevel(cb: (level: number) => void): () => void;
	getUseMockAsr(): Promise<boolean>;
	runTask(intent: string): Promise<void>;
	retryTask(): Promise<void>;
	askResponse(optionId: string): Promise<void>;
	getConfig(): Promise<FoldConfig>;
	getHomeSnapshot(): Promise<HomeSnapshot>;
	getLiveContext(): Promise<LiveContextLite>;
	getAppIcon(appPath: string, appName?: string): Promise<string | null>;
	listEpisodes(): Promise<EpisodeSummary[]>;
	getEpisode(id: string): Promise<EpisodeDetail | null>;
	onContextEvent(cb: (event: HomeContextEvent) => void): () => void;
	runConnectionAction(action: string, context?: Record<string, unknown>): Promise<{ ok: boolean }>;
	startConnectFlow(
		connectionId: string,
		kind: "login" | "install",
	): Promise<{
		sessionId: string;
		title: string;
		message: string;
		authUrl?: string;
		userCode?: string;
		opensBrowserAutomatically?: boolean;
	}>;
	pollConnectFlow(sessionId: string): Promise<{
		status: "pending" | "success" | "error";
		message?: string;
		error?: string;
	}>;
	cancelConnectFlow(sessionId: string): Promise<{ ok: boolean }>;
	openExternal(url: string): Promise<{ ok: boolean }>;
	saveConfig(config: FoldConfig): Promise<{ ok: boolean }>;
	setMousePassthrough(ignore: boolean): void;
	dismiss(): Promise<void>;
	toggleVoice(): Promise<void>;
	voiceError(message: string): Promise<void>;
	openSettings(section?: string): Promise<void>;
	quit(): Promise<void>;
	onHotkeyDown(cb: () => void): () => void;
	onHotkeyUp(cb: () => void): () => void;
	onHotkeyCancel(cb: () => void): () => void;
	onHomeNavigate(cb: (section: string) => void): () => void;
}

declare global {
	interface Window {
		fold: FoldApi;
	}
}

export {};
