export interface VoiceAdapter {
	start(opts: {
		onPartial: (text: string) => void;
		onError?: (err: Error) => void;
	}): Promise<void>;
	stop(): Promise<string>;
	cancel(): void;
	onLevel?(cb: (level: number) => void): void;
}

export interface VoiceConfig {
	wsBaseUrl?: string;
	workletPath?: string;
	languageHints?: string[];
	model?: string;
}

export type AsrProvider = "mock" | "dashscope" | "local-whisper";
