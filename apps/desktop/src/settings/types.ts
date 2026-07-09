export type HomeSection = "overview" | "profile" | "work" | "tasks" | "connections" | "settings";

export interface FoldConfig {
	dashscopeApiKey?: string;
	openrouterApiKey?: string;
	openaiApiKey?: string;
	zhipuApiKey?: string;
	zhipuOcrModel?: string;
	plannerProvider?: string;
	plannerModel?: string;
	mailProvider?: string;
	nangoSecretKey?: string;
	hubApiKey?: string;
	playwrightMcpExtensionToken?: string;
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

export interface EpisodeSummary extends HomeEpisode {
	durationMs: number;
	goal?: string;
	steps?: Array<{ stepId?: string; skill: string; label: string; status: string }>;
	apps?: Array<{ name: string; path?: string | null }>;
	stepCount?: number;
	successCount?: number;
}

export interface EpisodeDetail {
	id: string;
	intent: string;
	goal: string;
	status: string;
	timestamp: number;
	summary: string;
	durationMs: number;
	thinkingText: string;
	resultDetail: string | null;
	probeSummary: string | null;
	steps: Array<{
		stepId: string;
		label: string;
		skill: string;
		status: string;
		durationMs: number;
		error?: string;
	}>;
	validationChecks: Array<{ rule: string; passed: boolean; message?: string }>;
	contextEvents: Array<{
		id: string;
		type: string;
		timestamp: number;
		data: {
			appName?: string;
			windowTitle?: string;
			appPath?: string;
			filePath?: string;
			url?: string;
			text?: string;
		};
	}>;
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

export interface HomeContextEvent {
	id: string;
	type: string;
	timestamp: number;
	data: {
		appName?: string;
		windowTitle?: string;
		appPath?: string;
		filePath?: string;
		url?: string;
		text?: string;
	};
}

export interface LiveContextLite {
	activeApp: string | null;
	activeWindow: string | null;
	activeAppPath: string | null;
	events: HomeContextEvent[];
}

export interface UserProfileData {
	summary?: string;
	role?: string;
	domains?: string[];
	preferredTools?: string[];
	workPatterns?: string[];
	communicationStyle?: string;
	constraints?: string[];
	updatedAt?: number;
}
