// synced-from: Fold/packages/api/modules/billing/cost-catalog.ts
export type BillingFeature =
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
	audioInputTokens?: number;
	audioOutputTokens?: number;
	audioSeconds?: number;
	searchCalls?: number;
	ocrPages?: number;
	ttsCharacters?: number;
	browserSeconds?: number;
}

export interface QuoteCostInput {
	provider: string;
	model: string;
	feature: BillingFeature;
	funding?: FundingSource;
	usage: UsageUnits;
	rateVersion?: string;
	usdCnyRate?: number;
}

export interface QuoteCostResult {
	rateVersion: string;
	currency: "CNY";
	companyCostMicros: number;
	companyCostCny: number;
	estimated: boolean;
	breakdown: Record<string, number>;
}

export const ACTIVE_RATE_VERSION = "dashscope-2026-07-13";
const DEFAULT_USD_CNY = 7.2;
export const AUDIO_TOKENS_PER_SECOND = 25;

export const VOICE_LIMITS = {
	free: { voiceSeconds: 30 * 60, smartActions: 20 },
	pro: { voiceSeconds: 600 * 60, smartActions: 2_000 },
} as const;

type RateCard = {
	currency: "CNY" | "USD";
	inputTextPerMTok?: number;
	outputTextPerMTok?: number;
	cachedInputPerMTok?: number;
	audioInputPerMTok?: number;
	audioOutputPerMTok?: number;
	audioSeconds?: number;
	searchCall?: number;
	ocrPage?: number;
	ttsCharacter?: number;
	browserSecond?: number;
};

const RATE_CARDS: Record<string, RateCard> = {
	"dashscope:qwen3.5-omni-plus-realtime": {
		currency: "CNY",
		inputTextPerMTok: 7,
		outputTextPerMTok: 40,
		audioInputPerMTok: 53,
		audioOutputPerMTok: 213,
	},
	"dashscope:qwen3.5-omni-flash-realtime": {
		currency: "CNY",
		inputTextPerMTok: 2.2,
		outputTextPerMTok: 13.3,
		audioInputPerMTok: 18,
		audioOutputPerMTok: 72,
	},
	"dashscope:fun-asr-realtime": { currency: "CNY", audioSeconds: 0.00033 },
	"dashscope:qwen-flash": { currency: "CNY", inputTextPerMTok: 0.15, outputTextPerMTok: 1.5 },
	"dashscope:qwen-plus": { currency: "CNY", inputTextPerMTok: 0.8, outputTextPerMTok: 2 },
	"openrouter:*": { currency: "USD", inputTextPerMTok: 0.15, outputTextPerMTok: 0.6 },
	"openai:*": { currency: "USD", inputTextPerMTok: 0.15, outputTextPerMTok: 0.6 },
};

function cardKey(provider: string, model: string): string {
	return `${provider}:${model}`.toLowerCase();
}

function resolveRateCard(provider: string, model: string): { card: RateCard; estimated: boolean } {
	const exact = RATE_CARDS[cardKey(provider, model)];
	if (exact) return { card: exact, estimated: false };
	const wildcard = RATE_CARDS[`${provider.toLowerCase()}:*`];
	if (wildcard) return { card: wildcard, estimated: true };
	return {
		card: { currency: "USD", inputTextPerMTok: 1, outputTextPerMTok: 3 },
		estimated: true,
	};
}

function toCny(amount: number, currency: "CNY" | "USD", usdCnyRate: number): number {
	return currency === "CNY" ? amount : amount * usdCnyRate;
}

function yuanToMicros(yuan: number): number {
	return Math.round(yuan * 1_000_000);
}

export function quoteCost(input: QuoteCostInput): QuoteCostResult {
	const funding = input.funding ?? "company";
	const rateVersion = input.rateVersion ?? ACTIVE_RATE_VERSION;
	const usdCnyRate = input.usdCnyRate ?? DEFAULT_USD_CNY;

	if (funding === "byok") {
		return {
			rateVersion,
			currency: "CNY",
			companyCostMicros: 0,
			companyCostCny: 0,
			estimated: false,
			breakdown: { byok: 0 },
		};
	}

	const { card, estimated } = resolveRateCard(input.provider, input.model);
	const u = input.usage;
	const breakdown: Record<string, number> = {};
	let yuan = 0;
	const add = (key: string, amountYuan: number) => {
		if (!amountYuan) return;
		breakdown[key] = (breakdown[key] ?? 0) + amountYuan;
		yuan += amountYuan;
	};

	if (card.inputTextPerMTok && u.inputTextTokens) {
		add("inputText", toCny((u.inputTextTokens * card.inputTextPerMTok) / 1e6, card.currency, usdCnyRate));
	}
	if (card.outputTextPerMTok && u.outputTextTokens) {
		add("outputText", toCny((u.outputTextTokens * card.outputTextPerMTok) / 1e6, card.currency, usdCnyRate));
	}
	if (card.cachedInputPerMTok && u.cachedInputTokens) {
		add("cachedInput", toCny((u.cachedInputTokens * card.cachedInputPerMTok) / 1e6, card.currency, usdCnyRate));
	}
	if (card.audioInputPerMTok) {
		const audioTokens =
			u.audioInputTokens ??
			(u.audioSeconds ? Math.ceil(u.audioSeconds * AUDIO_TOKENS_PER_SECOND) : 0);
		if (audioTokens) {
			add("audioInput", toCny((audioTokens * card.audioInputPerMTok) / 1e6, card.currency, usdCnyRate));
		}
	}
	if (card.audioOutputPerMTok && u.audioOutputTokens) {
		add("audioOutput", toCny((u.audioOutputTokens * card.audioOutputPerMTok) / 1e6, card.currency, usdCnyRate));
	}
	if (card.audioSeconds && u.audioSeconds) {
		add("audioSeconds", toCny(u.audioSeconds * card.audioSeconds, card.currency, usdCnyRate));
	}

	return {
		rateVersion,
		currency: "CNY",
		companyCostMicros: yuanToMicros(yuan),
		companyCostCny: yuan,
		estimated,
		breakdown,
	};
}
