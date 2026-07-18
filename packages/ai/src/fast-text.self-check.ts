/**
 * 回归用例：Kimi Code Plan（moonshot 走该 baseURL 时）只接受 temperature=1，
 * generateFastText 之前硬编码 0.25 会直接 400（07-18 实测复现）。
 * 用法：pnpm exec dotenv -c -- tsx packages/ai/src/fast-text.self-check.ts
 */
import assert from "node:assert/strict";
import { generateFastText } from "./fast-text.js";
import { hasFastModelApiKey, resolveModelChoice } from "./model-choice.js";

async function main() {
	if (!hasFastModelApiKey()) {
		console.log("fast-text self-check skipped: no fast model API key configured");
		return;
	}
	const choice = resolveModelChoice("fast");
	const out = await generateFastText('只回复 JSON：{"text":"pong"}', {
		maxOutputTokens: 50,
		feature: "voice_structure",
	});
	assert.ok(out.trim().length > 0, `provider=${choice.provider} model=${choice.model} 返回空文本`);
	console.log(`fast-text self-check passed (provider=${choice.provider})`);
}

main().catch((e) => {
	console.error("THREW", e);
	process.exit(1);
});
