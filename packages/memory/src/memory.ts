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
	};
}

export function upsertMemory(
	input: {
		type: string;
		key: string;
		value: string;
		confidence?: number;
		source?: string;
	},
	dataDir?: string,
): MemoryRecord {
	const conn = getDb(dataDir);
	const now = Date.now();
	const existing = conn
		.prepare(`SELECT id FROM memories WHERE type = ? AND key = ? AND active = 1`)
		.get(input.type, input.key) as { id: string } | undefined;

	if (existing) {
		conn
			.prepare(
				`UPDATE memories SET value = ?, confidence = ?, source_episode_id = ?, updated_at = ? WHERE id = ?`,
			)
			.run(input.value, input.confidence ?? 0.85, input.source ?? null, now, existing.id);
		const row = conn.prepare(`SELECT * FROM memories WHERE id = ?`).get(existing.id);
		return mapMemoryRow(row as Parameters<typeof mapMemoryRow>[0]);
	}

	const id = randomUUID();
	conn
		.prepare(
			`INSERT INTO memories (id, type, key, value, confidence, source_episode_id, created_at, updated_at, active)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
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
		updatedAt: Number(map.get("updatedAt")) || undefined,
	};
}
