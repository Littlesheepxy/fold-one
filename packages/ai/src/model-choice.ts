import process from "node:process";
import { PROVIDER_TABLE, type ModelChoice, type ModelRole, type Provider } from "./types.js";

/** 各 Provider 上适合转写净化 / 代回草案的默认快模型（低 TTFT、短输出）。 */
export function defaultFastModel(provider: Provider): string {
	switch (provider) {
		case "dashscope":
			return "qwen-flash";
		case "deepseek":
			return "deepseek-chat";
		case "moonshot":
			return "moonshot-v1-8k";
		case "zhipu":
			return "glm-4.7-flashx";
		case "anthropic":
			return "claude-3-5-haiku-20241022";
		case "openai":
			return "gpt-4o-mini";
		case "openrouter":
		default:
			return "google/gemini-3.1-flash-lite";
	}
}

/**
 * 代回截图直出：国内优先。
 * glm-5.2 是纯文本旗舰，看图要用 glm-5v-turbo。
 */
export function defaultFastVisionModel(provider: Provider): string {
	switch (provider) {
		case "zhipu":
			return "glm-5v-turbo";
		case "dashscope":
			return "qwen3-vl-flash";
		case "moonshot":
			return "moonshot-v1-8k-vision-preview";
		case "openai":
			return "gpt-4o-mini";
		case "openrouter":
			return "google/gemini-2.5-flash-lite";
		default:
			return "qwen3-vl-flash";
	}
}

function readProvider(raw: string | undefined, fallback: Provider): Provider {
	const value = raw?.trim() as Provider | undefined;
	if (value && value in PROVIDER_TABLE) return value;
	return fallback;
}

function firstProviderWithKey(candidates: Provider[]): Provider | null {
	for (const provider of candidates) {
		if (hasApiKeyForProvider(provider)) return provider;
	}
	return null;
}

export function resolveModelChoice(role: ModelRole): ModelChoice {
	if (role === "fastVision") {
		const preferred = readProvider(
			process.env.FOLD_VISION_PROVIDER ?? process.env.FOLD_FAST_PROVIDER,
			"zhipu",
		);
		const provider =
			(hasApiKeyForProvider(preferred) ? preferred : null) ??
			firstProviderWithKey(["zhipu", "dashscope", "moonshot", "openai", "openrouter"]) ??
			preferred;
		const model =
			process.env.FOLD_VISION_MODEL?.trim() || defaultFastVisionModel(provider);
		return { provider, model };
	}
	if (role === "fast") {
		const fallbackProvider = readProvider(process.env.FOLD_PLANNER_PROVIDER, "openrouter");
		const provider = readProvider(process.env.FOLD_FAST_PROVIDER, fallbackProvider);
		const model = process.env.FOLD_FAST_MODEL?.trim() || defaultFastModel(provider);
		return { provider, model };
	}
	if (role === "planner") {
		const provider = readProvider(process.env.FOLD_PLANNER_PROVIDER, "openrouter");
		const model = process.env.FOLD_PLANNER_MODEL?.trim() || "openai/gpt-5.5";
		return { provider, model };
	}
	if (role === "repair") {
		const provider = readProvider(
			process.env.FOLD_REPAIR_PROVIDER ?? process.env.FOLD_PLANNER_PROVIDER,
			"openrouter",
		);
		const model =
			process.env.FOLD_REPAIR_MODEL?.trim() ||
			process.env.FOLD_PLANNER_MODEL?.trim() ||
			"openai/gpt-5.5";
		return { provider, model };
	}
	const provider = readProvider(process.env.FOLD_PLANNER_PROVIDER, "openrouter");
	const model = process.env.FOLD_PLANNER_MODEL?.trim() || "openai/gpt-5.5";
	return { provider, model };
}

export function hasApiKeyForProvider(provider: Provider): boolean {
	const cfg = PROVIDER_TABLE[provider];
	if (!cfg) return false;
	return Boolean(process.env[cfg.apiKeyEnv]?.trim());
}

export function hasFastModelApiKey(): boolean {
	return hasApiKeyForProvider(resolveModelChoice("fast").provider);
}

export function hasFastVisionApiKey(): boolean {
	return hasApiKeyForProvider(resolveModelChoice("fastVision").provider);
}

export function hasPlannerApiKey(): boolean {
	return hasApiKeyForProvider(resolveModelChoice("planner").provider);
}
