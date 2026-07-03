import type { FoldStateEvent } from "@fold/runtime";
import type {
	FoldConfig,
	EpisodeDetail,
	EpisodeSummary,
	HomeContextEvent,
	HomeSnapshot,
	LiveContextLite,
	UserProfileData,
} from "./settings/types.js";

interface ProfileImportOption {
	id: string;
	label: string;
	hasOpenTab: boolean;
	tabUrl?: string;
	tabTitle?: string;
	defaultUrl: string;
	automationSupported: boolean;
}

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
	predictPickIntent(intent: string): Promise<{ ok: boolean }>;
	predictInsertDraft(text: string): Promise<{ ok: boolean; pasted: boolean }>;
	predictStartVoice(): Promise<{ ok: boolean }>;
	profileImportOptions(): Promise<ProfileImportOption[]>;
	profileBuildPrompt(): Promise<string>;
	profileCopyPrompt(): Promise<{ prompt: string }>;
	profileGet(): Promise<UserProfileData | null>;
	profileRunImport(
		platformId: string,
		tabUrl?: string,
	): Promise<{ ok: boolean; response?: string; error?: string; prompt: string }>;
	profileSaveResponse(responseText: string): Promise<{
		ok: boolean;
		error?: string;
		profile?: UserProfileData;
	}>;
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
