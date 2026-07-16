import { randomUUID } from "node:crypto";
import { generateText, streamText } from "ai";
import { toLanguageModel } from "./providers.js";
import type { ModelChoice } from "./types.js";

export type GatewayFeature =
	| "voice_structure"
	| "voice_reply"
	| "noticed"
	| "planner"
	| "repair"
	| "agent"
	| "search"
	| "ocr"
	| "tts";

export type FundingSource = "company" | "byok";

export interface UsageUnits {
	inputTextTokens?: number;
	outputTextTokens?: number;
	cachedInputTokens?: number;
	reasoningTokens?: number;
}

export interface LlmCallContext {
	feature: GatewayFeature;
	requestId?: string;
	operationId?: string;
	funding?: FundingSource;
	/** Count against smart-action quota. Default: planner/repair/noticed = 1. */
	smartActions?: number;
}

function hubBaseUrl(): string {
	return (process.env.FOLD_HUB_URL?.trim() || "https://foldhub.cn").replace(/\/$/, "");
}

function resolveFunding(explicit?: FundingSource): FundingSource {
	if (explicit) return explicit;
	// Desktop currently injects user-owned keys into env → treat as BYOK until company proxy lands.
	return "byok";
}

function extractUsage(raw: unknown): UsageUnits {
	const usage = (raw ?? {}) as Record<string, unknown>;
	const num = (key: string) => {
		const value = usage[key];
		return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.round(value)) : undefined;
	};
	return {
		inputTextTokens: num("inputTokens") ?? num("promptTokens") ?? num("inputTextTokens"),
		outputTextTokens: num("outputTokens") ?? num("completionTokens") ?? num("outputTextTokens"),
		cachedInputTokens: num("cachedInputTokens"),
		reasoningTokens: num("reasoningTokens"),
	};
}

async function reportLlmUsageToHub(payload: {
	requestId: string;
	feature: GatewayFeature;
	provider: string;
	model: string;
	funding: FundingSource;
	operationId?: string;
	smartActions?: number;
	usage: UsageUnits;
}): Promise<void> {
	const apiKey = process.env.FOLD_HUB_API_KEY?.trim();
	if (!apiKey?.startsWith("tm_")) return;
	try {
		const res = await fetch(`${hubBaseUrl()}/api/billing/llm-usage`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
		if (!res.ok) {
			console.warn(`[ai-gateway] llm-usage failed (${res.status})`);
		}
	} catch (error) {
		console.warn("[ai-gateway] llm-usage report failed", error);
	}
}

export async function gatewayGenerateText(
	choice: ModelChoice,
	input: { prompt: string; maxOutputTokens?: number; temperature?: number },
	ctx: LlmCallContext,
): Promise<{ text: string; usage: UsageUnits; requestId: string }> {
	const requestId = ctx.requestId ?? randomUUID();
	const funding = resolveFunding(ctx.funding);
	const model = toLanguageModel(choice);
	const result = await generateText({
		model,
		prompt: input.prompt,
		maxOutputTokens: input.maxOutputTokens,
		temperature: input.temperature,
	});
	const usage = extractUsage(result.usage);
	void reportLlmUsageToHub({
		requestId,
		feature: ctx.feature,
		provider: choice.provider,
		model: choice.model,
		funding,
		operationId: ctx.operationId,
		smartActions: ctx.smartActions,
		usage,
	});
	return { text: result.text, usage, requestId };
}

export async function gatewayStreamText(
	choice: ModelChoice,
	input: { prompt: string; maxOutputTokens?: number; temperature?: number },
	ctx: LlmCallContext,
	onChunk: (chunk: string) => void,
	isCancelled?: () => boolean,
): Promise<{ text: string; usage: UsageUnits; requestId: string }> {
	const requestId = ctx.requestId ?? randomUUID();
	const funding = resolveFunding(ctx.funding);
	const model = toLanguageModel(choice);
	const result = streamText({
		model,
		prompt: input.prompt,
		maxOutputTokens: input.maxOutputTokens,
		temperature: input.temperature,
	});
	let full = "";
	for await (const chunk of result.textStream) {
		if (isCancelled?.()) break;
		full += chunk;
		onChunk(chunk);
	}
	const usage = extractUsage(await result.usage);
	if (!isCancelled?.()) {
		void reportLlmUsageToHub({
			requestId,
			feature: ctx.feature,
			provider: choice.provider,
			model: choice.model,
			funding,
			operationId: ctx.operationId,
			smartActions: ctx.smartActions,
			usage,
		});
	}
	return { text: full, usage, requestId };
}
