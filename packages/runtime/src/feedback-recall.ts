import { createHash } from "node:crypto";
import {
	listActiveMemories,
	loadProfileMemories,
	saveProfileMemories,
	upsertMemory,
} from "@fold/memory";

export type PredictFeedbackKind = "dismiss" | "reject" | "accept";

export interface PredictFeedbackInput {
	kind: PredictFeedbackKind;
	surface?: string | null;
	intent?: string | null;
	draft?: string | null;
	anchor?: string | null;
}

const FEEDBACK_TYPE = "feedback.predict";
const LOOKBACK_MS = 14 * 24 * 3600 * 1000;

/** 记录一次预测交互反馈（关闭 / 明确拒绝 / 采用）。 */
export function recordPredictFeedback(
	input: PredictFeedbackInput,
	dataDir?: string,
): void {
	const at = Date.now();
	const key = `${at}-${input.kind}-${hashShort(input.intent ?? input.draft ?? "")}`;
	upsertMemory(
		{
			type: FEEDBACK_TYPE,
			key,
			value: JSON.stringify({
				kind: input.kind,
				surface: input.surface ?? null,
				intent: clip(input.intent, 160),
				draft: clip(input.draft, 200),
				anchor: clip(input.anchor, 80),
				at,
			}),
			confidence: input.kind === "reject" ? 0.85 : input.kind === "accept" ? 0.9 : 0.55,
			source: "predict-feedback",
		},
		dataDir,
	);

	if (input.kind === "reject" || input.kind === "dismiss") {
		promoteFeedbackConstraints(dataDir);
	}
}

/** 把重复拒绝归纳成 profile.constraints，供 buildProfileBrief 注入。 */
export function promoteFeedbackConstraints(dataDir?: string): void {
	const since = Date.now() - LOOKBACK_MS;
	const rows = listActiveMemories(FEEDBACK_TYPE, dataDir)
		.map((m) => parseFeedback(m.value))
		.filter((f): f is NonNullable<typeof f> => f != null && f.at >= since);

	const rejects = rows.filter((r) => r.kind === "reject" || r.kind === "dismiss");
	const accepts = rows.filter((r) => r.kind === "accept");
	if (rejects.length < 2) return;

	const surfaceCounts = new Map<string, number>();
	for (const r of rejects) {
		const s = r.surface?.trim() || "predict";
		surfaceCounts.set(s, (surfaceCounts.get(s) ?? 0) + 1);
	}

	const newConstraints: string[] = [];
	for (const [surface, count] of surfaceCounts) {
		if (count < 2) continue;
		const acceptedSame = accepts.some((a) => (a.surface ?? "predict") === surface);
		if (acceptedSame && count < 3) continue;
		if (surface === "reply") {
			newConstraints.push("代回草案若偏客服腔或复述己方原话，应直接换一批，不要重复同款");
		} else {
			newConstraints.push(`预测卡片（${surface}）若连续不合用，优先保持沉默或换角度，勿重复同款建议`);
		}
	}

	if (!newConstraints.length) return;

	const existing = loadProfileMemories(dataDir) ?? {};
	const merged = [...(existing.constraints ?? [])];
	for (const c of newConstraints) {
		if (!merged.includes(c)) merged.push(c);
	}
	if (merged.length === (existing.constraints ?? []).length) return;

	saveProfileMemories(
		{
			...existing,
			constraints: merged.slice(-8),
			updatedAt: Date.now(),
		},
		"predict-feedback",
		dataDir,
	);
}

/** 供 prompt 注入：最近明确拒绝的摘要（最多 3 条）。 */
export function formatRecentRejectBrief(dataDir?: string, limit = 3): string {
	const since = Date.now() - LOOKBACK_MS;
	const rejects = listActiveMemories(FEEDBACK_TYPE, dataDir)
		.map((m) => parseFeedback(m.value))
		.filter((f): f is NonNullable<typeof f> => f != null && f.at >= since && f.kind === "reject")
		.sort((a, b) => b.at - a.at)
		.slice(0, limit);

	if (!rejects.length) return "";
	const lines = ["近期用户明确拒绝的建议（勿再给出同类）："];
	for (const r of rejects) {
		const what = r.draft || r.intent || r.anchor || "（无文案）";
		lines.push(`  - ${what}`);
	}
	return lines.join("\n");
}

function parseFeedback(raw: string): {
	kind: PredictFeedbackKind;
	surface?: string | null;
	intent?: string | null;
	draft?: string | null;
	anchor?: string | null;
	at: number;
} | null {
	try {
		const v = JSON.parse(raw) as {
			kind?: string;
			surface?: string | null;
			intent?: string | null;
			draft?: string | null;
			anchor?: string | null;
			at?: number;
		};
		if (v.kind !== "dismiss" && v.kind !== "reject" && v.kind !== "accept") return null;
		return {
			kind: v.kind,
			surface: v.surface,
			intent: v.intent,
			draft: v.draft,
			anchor: v.anchor,
			at: typeof v.at === "number" ? v.at : 0,
		};
	} catch {
		return null;
	}
}

function clip(text: string | null | undefined, max: number): string | null {
	const t = text?.trim();
	if (!t) return null;
	return t.length > max ? `${t.slice(0, max)}…` : t;
}

function hashShort(text: string): string {
	return createHash("sha1").update(text).digest("hex").slice(0, 8);
}

/** ponytail: 最小自检 */
export function runFeedbackRecallSelfCheck(): void {
	const parsed = parseFeedback(
		JSON.stringify({
			kind: "reject",
			surface: "reply",
			draft: "好的没问题",
			at: Date.now(),
		}),
	);
	console.assert(parsed?.kind === "reject", "parse reject");
	console.assert(hashShort("abc").length === 8, "hash length");
}
