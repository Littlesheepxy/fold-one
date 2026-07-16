// synced-from: Fold/packages/api/modules/billing/usage-ledger.ts
import {
	type BillingFeature,
	type FundingSource,
	quoteCost,
	type UsageUnits,
	VOICE_LIMITS,
} from "./cost-catalog.js";
import { db, newId, nowIso } from "./db.js";
import { allProProductIds } from "./products.js";

export type PlanTier = "free" | "pro";

function nextPeriodEnd(from: Date): Date {
	const periodEnd = new Date(from);
	periodEnd.setMonth(periodEnd.getMonth() + 1);
	periodEnd.setDate(1);
	periodEnd.setHours(0, 0, 0, 0);
	return periodEnd;
}

export function resolvePlanTier(userId: string): { planTier: PlanTier } {
	const purchases = db
		.prepare(
			`SELECT productId, status FROM purchase
       WHERE userId = ? AND status IN ('active', 'trialing')
       ORDER BY updatedAt DESC`,
		)
		.all(userId) as Array<{ productId: string; status: string | null }>;
	const proIds = allProProductIds();
	const pro = purchases.find((p) => proIds.includes(p.productId));
	return { planTier: pro ? "pro" : "free" };
}

type UsageRow = {
	id: string;
	userId: string;
	voiceSeconds: number;
	smartActions: number;
	companyCostMicros: string;
	periodStart: string;
	periodEnd: string;
};

export function getOrCreateAiUsage(userId: string): UsageRow {
	const now = new Date();
	let usage = db.prepare("SELECT * FROM ai_usage WHERE userId = ?").get(userId) as
		| UsageRow
		| undefined;
	const ts = nowIso();
	if (!usage) {
		const id = newId();
		db.prepare(
			`INSERT INTO ai_usage
       (id, userId, periodStart, periodEnd, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?)`,
		).run(id, userId, ts, nextPeriodEnd(now).toISOString(), ts, ts);
		usage = db.prepare("SELECT * FROM ai_usage WHERE userId = ?").get(userId) as UsageRow;
	}
	if (now >= new Date(usage.periodEnd)) {
		db.prepare(
			`UPDATE ai_usage SET
         amaReplies = 0, traceAnalyses = 0, profileOptimizations = 0,
         voiceSeconds = 0, smartActions = 0, companyCostMicros = '0',
         periodStart = ?, periodEnd = ?, updatedAt = ?
       WHERE userId = ?`,
		).run(ts, nextPeriodEnd(now).toISOString(), ts, userId);
		usage = db.prepare("SELECT * FROM ai_usage WHERE userId = ?").get(userId) as UsageRow;
	}
	return usage;
}

export function getEntitlements(userId: string) {
	const { planTier } = resolvePlanTier(userId);
	const limits = VOICE_LIMITS[planTier];
	const usage = getOrCreateAiUsage(userId);
	return {
		planTier,
		periodEnd: usage.periodEnd,
		voiceSecondsUsed: usage.voiceSeconds,
		voiceSecondsLimit: limits.voiceSeconds,
		voiceSecondsRemaining: Math.max(0, limits.voiceSeconds - usage.voiceSeconds),
		smartActionsUsed: usage.smartActions,
		smartActionsLimit: limits.smartActions,
		smartActionsRemaining: Math.max(0, limits.smartActions - usage.smartActions),
		companyCostMicros: usage.companyCostMicros,
	};
}

export function consumeUsage(input: {
	userId: string;
	voiceSeconds?: number;
	smartActions?: number;
}): { ok: true } | { ok: false; reason: string } {
	const entitlements = getEntitlements(input.userId);
	const voiceSeconds = Math.max(0, Math.ceil(input.voiceSeconds ?? 0));
	const smartActions = Math.max(0, Math.ceil(input.smartActions ?? 0));
	if (voiceSeconds > entitlements.voiceSecondsRemaining) {
		return { ok: false, reason: "voice_quota_exceeded" };
	}
	if (smartActions > entitlements.smartActionsRemaining) {
		return { ok: false, reason: "smart_action_quota_exceeded" };
	}
	if (voiceSeconds === 0 && smartActions === 0) return { ok: true };
	db.prepare(
		`UPDATE ai_usage SET
       voiceSeconds = voiceSeconds + ?,
       smartActions = smartActions + ?,
       updatedAt = ?
     WHERE userId = ?`,
	).run(voiceSeconds, smartActions, nowIso(), input.userId);
	return { ok: true };
}

export function recordCost(input: {
	requestId: string;
	operationId?: string;
	userId: string;
	feature: BillingFeature;
	provider: string;
	model: string;
	funding?: FundingSource;
	usage: UsageUnits;
}): { created: boolean; companyCostMicros: string } {
	const existing = db
		.prepare("SELECT companyCostMicros FROM ai_cost_event WHERE requestId = ?")
		.get(input.requestId) as { companyCostMicros: string } | undefined;
	if (existing) {
		return { created: false, companyCostMicros: existing.companyCostMicros };
	}

	const quote = quoteCost({
		provider: input.provider,
		model: input.model,
		feature: input.feature,
		funding: input.funding,
		usage: input.usage,
	});
	const funding = input.funding ?? "company";
	const day = new Date().toISOString().slice(0, 10);
	const ts = nowIso();
	const micros = String(quote.companyCostMicros);

	const tx = () => {
		db.prepare(
			`INSERT INTO ai_cost_event (
         id, requestId, operationId, userId, feature, provider, model, funding,
         rateVersion, estimated, inputTextTokens, outputTextTokens, cachedInputTokens,
         reasoningTokens, audioInputTokens, audioOutputTokens, audioSeconds,
         searchCalls, ocrPages, ttsCharacters, browserSeconds,
         companyCostMicros, currency, breakdown, createdAt
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			newId(),
			input.requestId,
			input.operationId ?? null,
			input.userId,
			input.feature,
			input.provider,
			input.model,
			funding,
			quote.rateVersion,
			quote.estimated ? 1 : 0,
			input.usage.inputTextTokens ?? 0,
			input.usage.outputTextTokens ?? 0,
			input.usage.cachedInputTokens ?? 0,
			input.usage.reasoningTokens ?? 0,
			input.usage.audioInputTokens ?? 0,
			input.usage.audioOutputTokens ?? 0,
			Math.ceil(input.usage.audioSeconds ?? 0),
			input.usage.searchCalls ?? 0,
			input.usage.ocrPages ?? 0,
			input.usage.ttsCharacters ?? 0,
			Math.ceil(input.usage.browserSeconds ?? 0),
			micros,
			quote.currency,
			JSON.stringify(quote.breakdown),
			ts,
		);

		const daily = db
			.prepare(
				`SELECT id, requestCount, audioSeconds, companyCostMicros FROM ai_cost_daily
         WHERE userId = ? AND day = ? AND feature = ? AND provider = ? AND model = ? AND funding = ?`,
			)
			.get(input.userId, day, input.feature, input.provider, input.model, funding) as
			| {
					id: string;
					requestCount: number;
					audioSeconds: number;
					companyCostMicros: string;
			  }
			| undefined;

		const audioSeconds = Math.ceil(input.usage.audioSeconds ?? 0);
		if (daily) {
			db.prepare(
				`UPDATE ai_cost_daily SET
           requestCount = ?, audioSeconds = ?, companyCostMicros = ?, updatedAt = ?
         WHERE id = ?`,
			).run(
				daily.requestCount + 1,
				daily.audioSeconds + audioSeconds,
				String(BigInt(daily.companyCostMicros) + BigInt(micros)),
				ts,
				daily.id,
			);
		} else {
			db.prepare(
				`INSERT INTO ai_cost_daily (
           id, userId, day, feature, provider, model, funding,
           requestCount, audioSeconds, companyCostMicros, createdAt, updatedAt
         ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)`,
			).run(
				newId(),
				input.userId,
				day,
				input.feature,
				input.provider,
				input.model,
				funding,
				audioSeconds,
				micros,
				ts,
				ts,
			);
		}

		if (quote.companyCostMicros > 0) {
			getOrCreateAiUsage(input.userId);
			const usage = db
				.prepare("SELECT companyCostMicros FROM ai_usage WHERE userId = ?")
				.get(input.userId) as { companyCostMicros: string };
			db.prepare(
				`UPDATE ai_usage SET companyCostMicros = ?, updatedAt = ? WHERE userId = ?`,
			).run(String(BigInt(usage.companyCostMicros) + BigInt(micros)), ts, input.userId);
		}
	};
	db.exec("BEGIN");
	try {
		tx();
		db.exec("COMMIT");
	} catch (error) {
		db.exec("ROLLBACK");
		throw error;
	}

	return { created: true, companyCostMicros: micros };
}
