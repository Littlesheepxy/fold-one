import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
	canUseSmartAction,
	consumeTrialSmartAction,
	INITIAL_TRIAL_SMART_ACTIONS,
	normalizePlanTier,
	remainingTrialSmartActions,
	resolveEntitlements,
	deriveExecutionFlags,
	normalizeExecutionMode,
	type PlanTier,
} from "@fold/runtime";
import { resolveDataDir } from "./data-dir.js";

export type AsrProvider = "auto" | "local-funasr" | "local-whisper" | "dashscope";

export interface FoldConfig {
	planTier?: PlanTier;
	asrProvider?: AsrProvider;
	localWhisperModelPath?: string;
	trialSmartActionsRemaining?: number;
	byokOverrides?: boolean;
	dashscopeApiKey?: string;
	openrouterApiKey?: string;
	openaiApiKey?: string;
	zhipuApiKey?: string;
	zhipuOcrModel?: string;
	plannerProvider?: string;
	plannerModel?: string;
	/** 转写净化、代回草案；留空则用各 Provider 默认快模型 */
	fastProvider?: string;
	fastModel?: string;
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
	workbuddyMcpToken?: string;
	uitarsVlmBaseUrl?: string;
	uitarsVlmApiKey?: string;
	uitarsVlmModel?: string;
	executionMode?: "auto" | "local_agent" | "fold_only";
	enabledCapabilities?: string[];
	preferredExecutor?: "claude-code" | "codex" | "cursor" | "workbuddy" | "auto";
	skipLocalAgent?: boolean;
	/** 转写整理完成后自动粘贴到前台输入框；默认 true */
	structureAutoInsert?: boolean;
	onboarding?: {
		completedAt?: number;
		step?: string;
		profileImportedAt?: number;
		profileImportSkippedAt?: number;
	};
}

export type ExecutionMode = "auto" | "local_agent" | "fold_only";

function configDir(): string {
	return resolveDataDir();
}

function configPath(): string {
	return join(configDir(), "config.json");
}

export function getConfigPath(): string {
	return configPath();
}

export function loadConfig(): FoldConfig {
	const path = configPath();
	try {
		if (!existsSync(path)) {
			return {
				planTier: "free",
				asrProvider: "auto",
				executionMode: "auto",
				trialSmartActionsRemaining: INITIAL_TRIAL_SMART_ACTIONS,
			};
		}
		const config = JSON.parse(readFileSync(path, "utf8")) as FoldConfig;
		return {
			...config,
			planTier: normalizePlanTier(config.planTier),
			asrProvider: config.asrProvider ?? "auto",
			trialSmartActionsRemaining: remainingTrialSmartActions(
				config.trialSmartActionsRemaining,
			),
		};
	} catch {
		return {
			planTier: "free",
			asrProvider: "auto",
			trialSmartActionsRemaining: INITIAL_TRIAL_SMART_ACTIONS,
		};
	}
}

export function saveConfig(config: FoldConfig): void {
	const dir = configDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const normalized: FoldConfig = {
		...config,
		planTier: normalizePlanTier(config.planTier),
		asrProvider: config.asrProvider ?? "auto",
		trialSmartActionsRemaining: remainingTrialSmartActions(
			config.trialSmartActionsRemaining,
		),
	};
	writeFileSync(configPath(), JSON.stringify(normalized, null, 2), "utf8");
}

/** Merge saved config into process.env for runtime packages. */
export function applyConfigToEnv(config: FoldConfig = loadConfig()): void {
	process.env.FOLD_PLAN_TIER = normalizePlanTier(config.planTier);
	process.env.FOLD_EXECUTION_MODE = normalizeExecutionMode(config.executionMode);
	if (config.preferredExecutor) {
		process.env.FOLD_PREFERRED_EXECUTOR = config.preferredExecutor;
	}
	const flags = deriveExecutionFlags({
		executionMode: config.executionMode ?? "auto",
		enabledCapabilities: config.enabledCapabilities,
	});
	process.env.FOLD_ALLOW_AGENT_SUBAGENTS = flags.allowAgentSubagents ? "1" : "0";
	process.env.FOLD_ALLOW_WORKBUDDY = flags.allowWorkbuddy ? "1" : "0";
	process.env.FOLD_ASR_PROVIDER = config.asrProvider ?? "auto";
	if (config.localWhisperModelPath) {
		process.env.FOLD_LOCAL_WHISPER_MODEL_PATH = config.localWhisperModelPath;
	}
	process.env.FOLD_TRIAL_SMART_ACTIONS_REMAINING = String(
		remainingTrialSmartActions(config.trialSmartActionsRemaining),
	);
	if (config.dashscopeApiKey) process.env.DASHSCOPE_API_KEY = config.dashscopeApiKey;
	if (config.openrouterApiKey) process.env.OPENROUTER_API_KEY = config.openrouterApiKey;
	if (config.openaiApiKey) process.env.OPENAI_API_KEY = config.openaiApiKey;
	if (config.zhipuApiKey) process.env.ZHIPU_API_KEY = config.zhipuApiKey;
	if (config.zhipuOcrModel) process.env.ZHIPU_OCR_MODEL = config.zhipuOcrModel;
	if (config.plannerProvider) process.env.FOLD_PLANNER_PROVIDER = config.plannerProvider;
	if (config.plannerModel) process.env.FOLD_PLANNER_MODEL = config.plannerModel;
	if (config.fastProvider) process.env.FOLD_FAST_PROVIDER = config.fastProvider;
	if (config.fastModel) process.env.FOLD_FAST_MODEL = config.fastModel;
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
	if (config.workbuddyGatewayUrl?.trim()) {
		process.env.FOLD_WORKBUDDY_GATEWAY_URL_MANUAL = config.workbuddyGatewayUrl.trim();
	} else {
		delete process.env.FOLD_WORKBUDDY_GATEWAY_URL_MANUAL;
	}
	if (config.workbuddyMcpToken?.trim()) {
		process.env.FOLD_WORKBUDDY_MCP_TOKEN_MANUAL = config.workbuddyMcpToken.trim();
	} else {
		delete process.env.FOLD_WORKBUDDY_MCP_TOKEN_MANUAL;
	}
	delete process.env.FOLD_WORKBUDDY_GATEWAY_URL;
	delete process.env.FOLD_WORKBUDDY_MCP_TOKEN;
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

export function resolveSmartActionAccess(config: FoldConfig = loadConfig()): {
	allowed: boolean;
	usesTrial: boolean;
} {
	const entitlements = resolveEntitlements(config.planTier);
	const hasByok = config.byokOverrides === true;
	return {
		allowed: canUseSmartAction(
			entitlements,
			config.trialSmartActionsRemaining,
			hasByok,
		),
		usesTrial: entitlements.tier === "free" && !hasByok,
	};
}

export function consumeSmartActionTrial(config: FoldConfig = loadConfig()): FoldConfig {
	const access = resolveSmartActionAccess(config);
	if (!access.usesTrial || !access.allowed) return config;
	const next = {
		...config,
		trialSmartActionsRemaining: consumeTrialSmartAction(
			config.trialSmartActionsRemaining,
		),
	};
	saveConfig(next);
	applyConfigToEnv(next);
	return next;
}
