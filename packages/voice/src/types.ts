export interface VoiceResult {
	text: string;
	directStructured: boolean;
}

export interface VoiceAdapter {
	start(opts: {
		onPartial: (text: string) => void;
		onError?: (err: Error) => void;
	}): Promise<void>;
	stop(): Promise<VoiceResult>;
	cancel(): void;
	onLevel?(cb: (level: number) => void): void;
}

export interface VoiceConfig {
	wsBaseUrl?: string;
	workletPath?: string;
	languageHints?: string[];
	model?: string;
	mode?: "structure" | "reply" | "agent";
	app?: string | null;
	windowTitle?: string | null;
	/** Fold Hub tm_ API key for asr-proxy entitlement checks. */
	authToken?: string;
}

export type AsrProvider = "mock" | "dashscope" | "local-whisper";
