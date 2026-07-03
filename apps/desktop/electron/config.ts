import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

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

const CONFIG_DIR = (process.env.FOLD_DATA_DIR ?? join(homedir(), ".fold")).replace(
	/^~/,
	homedir(),
);
const CONFIG_PATH = join(CONFIG_DIR, "config.json");

export function getConfigPath(): string {
	return CONFIG_PATH;
}

export function loadConfig(): FoldConfig {
	try {
		if (!existsSync(CONFIG_PATH)) return {};
		return JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as FoldConfig;
	} catch {
		return {};
	}
}

export function saveConfig(config: FoldConfig): void {
	if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true });
	writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), "utf8");
}

/** Merge saved config into process.env for runtime packages. */
export function applyConfigToEnv(config: FoldConfig = loadConfig()): void {
	if (config.dashscopeApiKey) process.env.DASHSCOPE_API_KEY = config.dashscopeApiKey;
	if (config.openrouterApiKey) process.env.OPENROUTER_API_KEY = config.openrouterApiKey;
	if (config.openaiApiKey) process.env.OPENAI_API_KEY = config.openaiApiKey;
	if (config.zhipuApiKey) process.env.ZHIPU_API_KEY = config.zhipuApiKey;
	if (config.zhipuOcrModel) process.env.ZHIPU_OCR_MODEL = config.zhipuOcrModel;
	if (config.plannerProvider) process.env.FOLD_PLANNER_PROVIDER = config.plannerProvider;
	if (config.plannerModel) process.env.FOLD_PLANNER_MODEL = config.plannerModel;
	if (config.mailProvider) process.env.FOLD_MAIL_PROVIDER = config.mailProvider;
	if (config.nangoSecretKey) process.env.FOLD_NANGO_SECRET_KEY = config.nangoSecretKey;
	if (config.hubApiKey) process.env.FOLD_HUB_API_KEY = config.hubApiKey;
	if (config.playwrightMcpExtensionToken) {
		process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN = config.playwrightMcpExtensionToken;
	}
	if (config.asrWsUrl) process.env.FOLD_ASR_WS_URL = config.asrWsUrl;
	if (config.chromeCdpUrl) process.env.FOLD_CHROME_CDP_URL = config.chromeCdpUrl;
	if (typeof config.allowScriptExecution === "boolean") {
		process.env.FOLD_ALLOW_SCRIPT_EXECUTION = config.allowScriptExecution ? "1" : "0";
	}
	if (typeof config.allowFileWrite === "boolean") {
		process.env.FOLD_ALLOW_FILE_WRITE = config.allowFileWrite ? "1" : "0";
	}
	if (typeof config.allowAgentSubagents === "boolean") {
		process.env.FOLD_ALLOW_AGENT_SUBAGENTS = config.allowAgentSubagents ? "1" : "0";
	}
	if (typeof config.allowUitars === "boolean") {
		process.env.FOLD_ALLOW_UITARS = config.allowUitars ? "1" : "0";
	}
	if (typeof config.allowWorkbuddy === "boolean") {
		process.env.FOLD_ALLOW_WORKBUDDY = config.allowWorkbuddy ? "1" : "0";
	}
	if (config.workbuddyGatewayUrl) {
		process.env.FOLD_WORKBUDDY_GATEWAY_URL = config.workbuddyGatewayUrl;
	}
	if (config.uitarsVlmBaseUrl) {
		process.env.FOLD_UITARS_VLM_BASE_URL = config.uitarsVlmBaseUrl;
	}
	if (config.uitarsVlmApiKey) {
		process.env.FOLD_UITARS_VLM_API_KEY = config.uitarsVlmApiKey;
	}
	if (config.uitarsVlmModel) {
		process.env.FOLD_UITARS_VLM_MODEL = config.uitarsVlmModel;
	}
}

export function hasRealAsr(config: FoldConfig = loadConfig()): boolean {
	const key = config.dashscopeApiKey ?? process.env.DASHSCOPE_API_KEY;
	return Boolean(key?.trim());
}
