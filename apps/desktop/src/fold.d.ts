import type { FoldStateEvent } from "@fold/runtime";
import type { FoldConfig, HomeSnapshot } from "./settings/types.js";

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
	runConnectionAction(action: string, context?: Record<string, unknown>): Promise<{ ok: boolean }>;
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
