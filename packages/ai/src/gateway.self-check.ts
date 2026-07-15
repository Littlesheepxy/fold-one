import assert from "node:assert/strict";

// Lightweight unit check for usage extraction shape used by gateway.
function extractUsage(raw: unknown): {
	inputTextTokens?: number;
	outputTextTokens?: number;
	cachedInputTokens?: number;
	reasoningTokens?: number;
} {
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

const usage = extractUsage({
	inputTokens: 120,
	outputTokens: 40,
	cachedInputTokens: 10,
});
assert.equal(usage.inputTextTokens, 120);
assert.equal(usage.outputTextTokens, 40);
assert.equal(usage.cachedInputTokens, 10);

const legacy = extractUsage({ promptTokens: 50, completionTokens: 12 });
assert.equal(legacy.inputTextTokens, 50);
assert.equal(legacy.outputTextTokens, 12);

console.log("ai gateway usage extract self-check ok");
