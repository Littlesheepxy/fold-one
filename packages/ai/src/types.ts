export type Provider =
	| "openai"
	| "anthropic"
	| "dashscope"
	| "deepseek"
	| "moonshot"
	| "openrouter";

export type ModelRole = "planner" | "repair" | "validator" | "fast";

export interface ModelChoice {
	provider: Provider;
	model: string;
}

export interface ProviderEnvConfig {
	baseURL: string;
	apiKeyEnv: string;
	displayName: string;
}

export const PROVIDER_TABLE: Record<Provider, ProviderEnvConfig> = {
	openai: {
		baseURL: "https://api.openai.com/v1",
		apiKeyEnv: "OPENAI_API_KEY",
		displayName: "OpenAI",
	},
	anthropic: {
		baseURL: "https://api.anthropic.com/v1",
		apiKeyEnv: "ANTHROPIC_API_KEY",
		displayName: "Anthropic",
	},
	dashscope: {
		baseURL: "https://dashscope.aliyuncs.com/compatible-mode/v1",
		apiKeyEnv: "DASHSCOPE_API_KEY",
		displayName: "DashScope",
	},
	deepseek: {
		baseURL: "https://api.deepseek.com/v1",
		apiKeyEnv: "DEEPSEEK_API_KEY",
		displayName: "DeepSeek",
	},
	moonshot: {
		baseURL: "https://api.moonshot.cn/v1",
		apiKeyEnv: "MOONSHOT_API_KEY",
		displayName: "Moonshot",
	},
	openrouter: {
		baseURL: "https://openrouter.ai/api/v1",
		apiKeyEnv: "OPENROUTER_API_KEY",
		displayName: "OpenRouter",
	},
};
