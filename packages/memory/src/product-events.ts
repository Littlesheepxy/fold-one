import { randomUUID } from "node:crypto";
import { getDb } from "./episode.js";

export type ProductEventName =
	| "onboarding_step_enter"
	| "onboarding_step_complete"
	| "first_real_reply_success"
	| "reply_draft_shown"
	| "reply_draft_inserted"
	| "reply_draft_rejected"
	| "reply_draft_dismissed"
	| "reply_draft_undone"
	| "agent_task_start"
	| "agent_task_success"
	| "agent_task_fail"
	| "asr_latency"
	| "weekly_recap_shown"
	| "weekly_recap_clicked"
	| "weekly_recap_dismissed";

export interface ProductEventInput {
	name: ProductEventName | string;
	props?: Record<string, unknown>;
	at?: number;
}

function ensureProductEventsTable(dataDir?: string): void {
	getDb(dataDir).exec(`
		CREATE TABLE IF NOT EXISTS product_events (
			id TEXT PRIMARY KEY,
			name TEXT NOT NULL,
			props_json TEXT NOT NULL DEFAULT '{}',
			at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_product_events_name_at ON product_events(name, at);
	`);
}

/** 本地产品埋点：无第三方，写 SQLite，供 report-metrics / 留存分析。 */
export function saveProductEvent(input: ProductEventInput, dataDir?: string): void {
	ensureProductEventsTable(dataDir);
	const at = input.at ?? Date.now();
	getDb(dataDir)
		.prepare(`INSERT INTO product_events (id, name, props_json, at) VALUES (?, ?, ?, ?)`)
		.run(randomUUID(), input.name, JSON.stringify(input.props ?? {}), at);
}

export function listProductEvents(
	opts?: { name?: string; since?: number; limit?: number },
	dataDir?: string,
): Array<{ id: string; name: string; props: Record<string, unknown>; at: number }> {
	ensureProductEventsTable(dataDir);
	const limit = Math.min(opts?.limit ?? 200, 2000);
	const since = opts?.since ?? 0;
	const rows = opts?.name
		? (getDb(dataDir)
				.prepare(
					`SELECT id, name, props_json, at FROM product_events
					 WHERE name = ? AND at >= ? ORDER BY at DESC LIMIT ?`,
				)
				.all(opts.name, since, limit) as Array<{
				id: string;
				name: string;
				props_json: string;
				at: number;
			}>)
		: (getDb(dataDir)
				.prepare(
					`SELECT id, name, props_json, at FROM product_events
					 WHERE at >= ? ORDER BY at DESC LIMIT ?`,
				)
				.all(since, limit) as Array<{
				id: string;
				name: string;
				props_json: string;
				at: number;
			}>);
	return rows.map((r) => ({
		id: r.id,
		name: r.name,
		props: (() => {
			try {
				return JSON.parse(r.props_json) as Record<string, unknown>;
			} catch {
				return {};
			}
		})(),
		at: r.at,
	}));
}

/** ponytail: 写入再读回 */
export function runProductEventsSelfCheck(dataDir?: string): void {
	const name = `selfcheck_${Date.now()}`;
	saveProductEvent({ name, props: { n: 1 } }, dataDir);
	const rows = listProductEvents({ name, limit: 5 }, dataDir);
	console.assert(rows.some((r) => r.name === name && r.props.n === 1), "product event roundtrip");
}
