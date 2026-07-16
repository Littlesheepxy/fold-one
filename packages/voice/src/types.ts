export interface VoiceResult {
	text: string;
	directStructured: boolean;
	/** 识别未完整收尾（超时/断线）；调用方不得当作成功插入 */
	incomplete?: boolean;
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
	/** keydown 预热的麦克风流：按下即开麦，会话开始时直接接管，消除开麦死区 */
	warmStream?: Promise<MediaStream>;
}

export type AsrProvider = "mock" | "dashscope" | "local-whisper";
