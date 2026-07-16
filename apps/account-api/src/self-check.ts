import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const dir = mkdtempSync(join(tmpdir(), "fold-account-"));
process.env.ACCOUNT_DB_PATH = join(dir, "test.sqlite");
process.env.ACCOUNT_AUTH_MODE = "mock";

const { requestLoginCode, verifyLoginCode, resolveUserFromBearer } = await import("./auth.js");
const { getEntitlements, consumeUsage } = await import("./usage-ledger.js");
const { activateSubscription } = await import("./payments.js");
const { CN_PRODUCT_IDS, cnProductMeta } = await import("./products.js");
const { quoteCost } = await import("./cost-catalog.js");

assert.equal(cnProductMeta(CN_PRODUCT_IDS.monthly).amountYuan, 29.9);
assert.equal(cnProductMeta(CN_PRODUCT_IDS.monthly).anchorYuan, 45.9);
assert.equal(cnProductMeta(CN_PRODUCT_IDS.yearly).amountYuan, 228);
assert.equal(cnProductMeta(CN_PRODUCT_IDS.yearly).anchorYuan, 358.8);

const byok = quoteCost({
	provider: "dashscope",
	model: "qwen-flash",
	feature: "planner",
	funding: "byok",
	usage: { inputTextTokens: 100, outputTextTokens: 50 },
});
assert.equal(byok.companyCostMicros, 0);

await requestLoginCode("demo@zhigeng.app");
const { user, apiKey } = verifyLoginCode({ email: "demo@zhigeng.app", code: "888888" });
assert.ok(apiKey.startsWith("zk_"));
assert.equal(user.email, "demo@zhigeng.app");

const authed = resolveUserFromBearer(`Bearer ${apiKey}`);
assert.equal(authed?.id, user.id);

let ents = getEntitlements(user.id);
assert.equal(ents.planTier, "free");
assert.equal(ents.voiceSecondsLimit, 1800);
assert.ok(ents.periodEnd);

activateSubscription({
	subscriptionId: "sub_test",
	customerId: "cus_test",
	productId: CN_PRODUCT_IDS.monthly,
	userId: user.id,
	provider: "mock",
});
ents = getEntitlements(user.id);
assert.equal(ents.planTier, "pro");
assert.equal(ents.voiceSecondsLimit, 36000);

const consumed = consumeUsage({ userId: user.id, voiceSeconds: 60 });
assert.equal(consumed.ok, true);
ents = getEntitlements(user.id);
assert.equal(ents.voiceSecondsUsed, 60);

rmSync(dir, { recursive: true, force: true });
console.log("account-api self-check ok");
