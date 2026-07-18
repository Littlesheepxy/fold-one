import { randomUUID } from "node:crypto";
import { getDb, type MemoryRecord } from "./episode.js";

export interface UserProfileData {
	summary?: string;
	role?: string;
	domains?: string[];
	preferredTools?: string[];
	workPatterns?: string[];
	communicationStyle?: string;
	constraints?: string[];
	updatedAt?: number;
	/** 三层协作上下文档案全文（Markdown） */
	migrationArchive?: string;
	/** 日整固自动归纳的表达习惯，见 consolidate.ts writeDigest 的 profile.consolidatedHabit */
	consolidatedHabits?: string[];
}

const PROFILE_PREFIX = "profile.";

function mapMemoryRow(row: {
	id: string;
	type: string;
	key: string;
	value: string;
	confidence: number;
	source_episode_id: string | null;
	created_at: number;
	updated_at: number;
	last_used_at: number | null;
	active: number;
	receipt_json?: string | null;
	supersedes?: string | null;
	superseded_by?: string | null;
}): MemoryRecord {
	return {
		id: row.id,
		type: row.type,
		key: row.key,
		value: row.value,
		confidence: row.confidence,
		sourceEpisodeId: row.source_episode_id,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		lastUsedAt: row.last_used_at,
		active: row.active === 1,
		receiptJson: row.receipt_json ?? null,
		supersedes: row.supersedes ?? null,
		supersededBy: row.superseded_by ?? null,
	};
}

export function upsertMemory(
	input: {
		type: string;
		key: string;
		value: string;
		confidence?: number;
		source?: string;
		/** 证据（触发来源、episode id、事件 id 等），任意可 JSON 序列化对象 */
		receipt?: unknown;
	},
	dataDir?: string,
): MemoryRecord {
	const conn = getDb(dataDir);
	const now = Date.now();
	const receiptJson = input.receipt === undefined ? null : JSON.stringify(input.receipt);
	const existing = conn
		.prepare(`SELECT id FROM memories WHERE type = ? AND key = ? AND active = 1`)
		.get(input.type, input.key) as { id: string } | undefined;

	if (existing) {
		const id = randomUUID();
		const insertNew = conn.prepare(
			`INSERT INTO memories (id, type, key, value, confidence, source_episode_id, created_at, updated_at, active, receipt_json, supersedes)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
		);
		const retireOld = conn.prepare(
			`UPDATE memories SET active = 0, superseded_by = ?, updated_at = ? WHERE id = ?`,
		);
		conn.transaction(() => {
			insertNew.run(
				id,
				input.type,
				input.key,
				input.value,
				input.confidence ?? 0.85,
				input.source ?? null,
				now,
				now,
				receiptJson,
				existing.id,
			);
			retireOld.run(id, now, existing.id);
		})();
		const row = conn.prepare(`SELECT * FROM memories WHERE id = ?`).get(id);
		return mapMemoryRow(row as Parameters<typeof mapMemoryRow>[0]);
	}

	const id = randomUUID();
	conn
		.prepare(
			`INSERT INTO memories (id, type, key, value, confidence, source_episode_id, created_at, updated_at, active, receipt_json)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
		)
		.run(
			id,
			input.type,
			input.key,
			input.value,
			input.confidence ?? 0.85,
			input.source ?? null,
			now,
			now,
			receiptJson,
		);
	const row = conn.prepare(`SELECT * FROM memories WHERE id = ?`).get(id);
	return mapMemoryRow(row as Parameters<typeof mapMemoryRow>[0]);
}

export function listActiveMemories(type?: string, dataDir?: string): MemoryRecord[] {
	const conn = getDb(dataDir);
	const rows = type
		? (conn
				.prepare(`SELECT * FROM memories WHERE active = 1 AND type = ? ORDER BY updated_at DESC`)
				.all(type) as Parameters<typeof mapMemoryRow>[0][])
		: (conn
				.prepare(`SELECT * FROM memories WHERE active = 1 ORDER BY updated_at DESC`)
				.all() as Parameters<typeof mapMemoryRow>[0][]);
	return rows.map(mapMemoryRow);
}

/** 软删除：active=0，不再注入 prompt / 列表。 */
export function deactivateMemory(id: string, dataDir?: string): boolean {
	const trimmed = id.trim();
	if (!trimmed) return false;
	const result = getDb(dataDir)
		.prepare(`UPDATE memories SET active = 0, updated_at = ? WHERE id = ? AND active = 1`)
		.run(Date.now(), trimmed);
	return result.changes > 0;
}

/** 从画像约束里删掉一条（用户纠正误学）。 */
export function removeProfileConstraint(constraint: string, dataDir?: string): boolean {
	const text = constraint.trim();
	if (!text) return false;
	const existing = loadProfileMemories(dataDir);
	const prev = existing?.constraints ?? [];
	const next = prev.filter((c) => c !== text);
	if (next.length === prev.length) return false;
	upsertMemory(
		{
			type: "preference",
			key: `${PROFILE_PREFIX}constraints`,
			value: JSON.stringify(next),
			confidence: 0.9,
			source: "user-edit",
		},
		dataDir,
	);
	return true;
}

export function saveProfileMemories(profile: UserProfileData, source: string, dataDir?: string): void {
	const now = Date.now();
	const entries: Array<[string, string]> = [
		["summary", profile.summary ?? ""],
		["role", profile.role ?? ""],
		["domains", JSON.stringify(profile.domains ?? [])],
		["preferredTools", JSON.stringify(profile.preferredTools ?? [])],
		["workPatterns", JSON.stringify(profile.workPatterns ?? [])],
		["communicationStyle", profile.communicationStyle ?? ""],
		["constraints", JSON.stringify(profile.constraints ?? [])],
		["migrationArchive", profile.migrationArchive ?? ""],
		["updatedAt", String(profile.updatedAt ?? now)],
	];
	for (const [key, value] of entries) {
		if (!value || value === "[]") continue;
		upsertMemory({ type: "preference", key: `${PROFILE_PREFIX}${key}`, value, confidence: 0.9, source }, dataDir);
	}
}

export function loadProfileMemories(dataDir?: string): UserProfileData | null {
	const memories = listActiveMemories("preference", dataDir).filter((m) => m.key.startsWith(PROFILE_PREFIX));
	if (memories.length === 0) return null;

	const map = new Map(memories.map((m) => [m.key.slice(PROFILE_PREFIX.length), m.value]));
	const parseList = (key: string): string[] => {
		try {
			const parsed = JSON.parse(map.get(key) ?? "[]");
			return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [];
		} catch {
			return [];
		}
	};

	return {
		summary: map.get("summary") || undefined,
		role: map.get("role") || undefined,
		domains: parseList("domains"),
		preferredTools: parseList("preferredTools"),
		workPatterns: parseList("workPatterns"),
		communicationStyle: map.get("communicationStyle") || undefined,
		constraints: parseList("constraints"),
		migrationArchive: map.get("migrationArchive") || undefined,
		consolidatedHabits: parseList("consolidatedHabit"),
		updatedAt: Number(map.get("updatedAt")) || undefined,
	};
}
