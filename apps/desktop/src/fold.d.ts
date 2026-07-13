import type { FoldStateEvent } from "@fold/runtime";
import type {
	FoldConfig,
	EpisodeDetail,
	EpisodeSummary,
	HomeContextEvent,
	HomeAhaGuess,
	HomePredictPreview,
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

interface VoiceSessionStart {
	mode: "structure" | "reply" | "agent";
	app?: string | null;
	windowTitle?: string | null;
}

interface FoldApi {
	onState(cb: (state: FoldStateEvent) => void): () => void;
	onTranscript(cb: (text: string) => void): () => void;
	onVoiceLevel(cb: (level: number) => void): () => void;
	getUseMockAsr(): Promise<boolean>;
	getVoiceSetup(): Promise<{
		planTier: "free" | "pro" | "ultra";
		mode: "cloud" | "local" | "download-needed";
		ready: boolean;
		title: string;
		detail: string;
		downloadSizeMb?: number;
		trialRemaining?: number;
	}>;
	downloadVoicePack(): Promise<{ ok: true; path: string } | { ok: false; error: string }>;
	getAsrRuntime(): Promise<{
		provider: "mock" | "dashscope" | "local-whisper";
		modelPath?: string;
		ready: boolean;
	}>;
	localAsrStart(): Promise<{ ok: boolean }>;
	localAsrAudio(chunk: ArrayBuffer): void;
	localAsrFinish(): Promise<string>;
	localAsrCancel(): Promise<{ ok: boolean }>;
	runTask(intent: string): Promise<void>;
	structureVoice(transcript: string, opts?: { directStructured?: boolean }): Promise<void>;
	replyVoice(transcript: string): Promise<void>;
	retryTask(): Promise<void>;
	askResponse(optionId: string): Promise<void>;
	getConfig(): Promise<FoldConfig>;
	getHomeSnapshot(): Promise<HomeSnapshot>;
	getPredictPreview(): Promise<HomePredictPreview>;
	startAhaGuess(): Promise<{ ok: boolean; runId?: number }>;
	cancelAhaGuess(): Promise<{ ok: boolean }>;
	onAhaGuessChunk(cb: (payload: { runId: number; chunk: string }) => void): () => void;
	onAhaGuessDone(
		cb: (payload: {
			runId: number;
			suggestions?: HomeAhaGuess["suggestions"];
			reply?: string;
			error?: string;
			confidenceLevel?: HomeAhaGuess["confidenceLevel"];
			confidenceScore?: number;
		}) => void,
	): () => void;
	getLiveContext(): Promise<LiveContextLite>;
	restoreClipboard(payload: { id?: string; text?: string }): Promise<{ ok: boolean }>;
	focusContext(
		target: { kind: "app"; appName: string } | { kind: "url"; url: string },
	): Promise<{ ok: boolean }>;
	getAppIcon(appPath: string, appName?: string): Promise<string | null>;
	getFirstAppIcon(appNames: string[]): Promise<string | null>;
	listEpisodes(): Promise<EpisodeSummary[]>;
	getEpisode(id: string): Promise<EpisodeDetail | null>;
	predictPickIntent(intent: string): Promise<{ ok: boolean }>;
	predictInsertDraft(text: string): Promise<{ ok: boolean; pasted: boolean }>;
	structureInsertDraft(text: string, targetAppName?: string | null): Promise<{ ok: boolean; pasted: boolean }>;
	copyText(text: string): Promise<{ ok: boolean }>;
	predictStartVoice(): Promise<{ ok: boolean }>;
	predictRefineVoice(): Promise<{ ok: boolean }>;
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
		copyText?: string;
		copyThenOpen?: boolean;
	}>;
	pollConnectFlow(sessionId: string): Promise<{
		status: "pending" | "success" | "error";
		message?: string;
		error?: string;
	}>;
	activateWorkBuddyConnect(sessionId: string): Promise<{ ok: boolean; opened: boolean; url?: string }>;
	cancelConnectFlow(sessionId: string): Promise<{ ok: boolean }>;
	openExternal(url: string): Promise<{ ok: boolean }>;
	saveConfig(config: FoldConfig): Promise<{ ok: boolean }>;
	setMousePassthrough(ignore: boolean): void;
	getDisplayWorkArea(overlayPoint?: { x: number; y: number }): Promise<{
		x: number;
		y: number;
		width: number;
		height: number;
	}>;
	getOverlayState(): Promise<FoldStateEvent>;
	dismiss(): Promise<void>;
	toggleVoice(): Promise<void>;
	voiceError(message: string): Promise<void>;
	openSettings(section?: string): Promise<void>;
	scanInputHabits(): Promise<Record<string, unknown>>;
	listInstalledInputMethods(): Promise<Record<string, unknown>[]>;
	importInputHabits(): Promise<Record<string, unknown>>;
	getImportedInputHabits(): Promise<Record<string, unknown> | null>;
	exportInputHabitsRime(): Promise<Record<string, unknown> & { canceled?: boolean }>;
	quit(): Promise<void>;
	onHotkeyDown(cb: (session: VoiceSessionStart) => void): () => void;
	onHotkeyUp(cb: (mode: "structure" | "reply" | "agent") => void): () => void;
	onHotkeyCancel(cb: () => void): () => void;
	onHomeNavigate(cb: (section: string) => void): () => void;
	probeAccessibility(): Promise<{
		available: boolean;
		appLabel: string;
		bundlePath?: string;
		error?: string;
	}>;
	openAccessibilitySettings(): Promise<{ ok: boolean }>;
	onboardingGetState(): Promise<{
		completedAt?: number;
		step?: string;
		profileImportedAt?: number;
		profileImportSkippedAt?: number;
	}>;
	openOnboarding(opts?: { reset?: boolean }): Promise<{ ok: boolean }>;
	onboardingSetStep(step: string): Promise<Record<string, unknown>>;
	onboardingComplete(): Promise<{ ok: boolean }>;
	onboardingSkipProfile(): Promise<Record<string, unknown>>;
	onboardingCompareDemo(opts: { withProfile: boolean }): Promise<OnboardingCompareResult>;
	onboardingStructureVoice(transcript: string): Promise<string>;
	onboardingSetVoiceApp(app: string, windowTitle?: string): Promise<{ ok: boolean }>;
	onboardingAhaGuess(): Promise<{ ok: boolean; runId?: number }>;
	onboardingSimulateClipboard(lines: string[]): Promise<{
		ok: boolean;
		previous?: { id: string; text: string; appName?: string };
		current?: { id: string; text: string; appName?: string };
	}>;
	onOnboardingHotkeyEvent(cb: (payload: {
		key: string;
		phase: "down" | "up";
		longPress?: boolean;
	}) => void): () => void;
	onOnboardingVoiceEvent(cb: (payload: {
		phase: "listening" | "formatting" | "done" | "error";
		raw?: string;
		cleaned?: string;
		error?: string;
	}) => void): () => void;
}

interface OnboardingCompareResult {
	incoming: string;
	before: { transcript: string; reply: string };
	after: { transcript: string; reply: string };
	keywords: string[];
	checklist: string[];
	profileSummary?: {
		role?: string;
		domains?: string[];
		communicationStyle?: string;
	};
}

declare global {
	interface Window {
		fold: FoldApi;
	}
}

export {};
