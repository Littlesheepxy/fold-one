import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { LanguageModel } from "ai";
import { PROVIDER_TABLE, type ModelChoice, type Provider } from "./types.js";

export function toLanguageModel(choice: ModelChoice): LanguageModel {
	const cfg = PROVIDER_TABLE[choice.provider as Provider];
	if (!cfg) throw new Error(`[providers] unknown provider: ${choice.provider}`);

	const rawKey = process.env[cfg.apiKeyEnv];
	if (!rawKey) {
		throw new Error(`[providers] ${cfg.displayName} missing API key (env: ${cfg.apiKeyEnv})`);
	}
	const apiKey = rawKey.trim().replace(/^["']|["']$/g, "");

	const provider = createOpenAICompatible({
		name: choice.provider,
		baseURL: cfg.baseURL,
		apiKey,
		headers:
			choice.provider === "openrouter"
				? {
						"HTTP-Referer": process.env.OPENROUTER_REFERER ?? "https://fold.local",
						"X-Title": process.env.OPENROUTER_TITLE ?? "Fold Runtime",
					}
				: undefined,
	});

	return provider(choice.model);
}
