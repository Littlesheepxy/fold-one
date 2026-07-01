export type HomeSection = "overview" | "profile" | "work" | "connections" | "settings";

export interface FoldConfig {
	dashscopeApiKey?: string;
	openrouterApiKey?: string;
	openaiApiKey?: string;
	zhipuApiKey?: string;
	zhipuOcrModel?: string;
	plannerProvider?: string;
	plannerModel?: string;
	mailProvider?: string;
	asrWsUrl?: string;
	chromeCdpUrl?: string;
	allowScriptExecution?: boolean;
	allowFileWrite?: boolean;
	allowAgentSubagents?: boolean;
	allowUitars?: boolean;
	allowWorkbuddy?: boolean;
	workbuddyGatewayUrl?: string;
	uitarsVlmBaseUrl?: string;
	uitarsVlmApiKey?: string;
	uitarsVlmModel?: string;
}

export interface HomeEpisode {
	id: string;
	intent: string;
	status: string;
	timestamp: number;
	summary: string;
}

export interface HomeConnection {
	id: string;
	label: string;
	status: "ok" | "warn" | "error";
	detail?: string;
	meta?: Record<string, string | boolean | null | undefined>;
}

export interface HomeConfigSummary {
	hasPlannerKey: boolean;
	hasAsr: boolean;
	mailProvider: string;
	allowAgentSubagents: boolean;
	allowWorkbuddy: boolean;
	allowUitars: boolean;
}

export interface HomeSnapshot {
	episodes: HomeEpisode[];
	liveContext: {
		activeApp: string | null;
		activeWindow: string | null;
		recentUrls: Array<{ url: string; title: string }>;
		recentFiles: Array<{ path: string; name: string }>;
	};
	connections: HomeConnection[];
	configSummary: HomeConfigSummary;
}
