import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { ActionPlan } from "@fold/ai";

export interface EpisodeStep {
	stepId: string;
	skill: string;
	status: string;
	durationMs: number;
	error?: string;
}

export interface EpisodeSummary {
	intent: string;
	goal: string;
	outcome: string;
	userVisibleResult: string;
	apps: string[];
	files: string[];
	urls: string[];
	skills: string[];
	failures: string[];
	validationChecks: Array<{ rule: string; passed: boolean; message?: string }>;
}

export interface Episode {
	id: string;
	timestamp: number;
	intent: string;
	goal: string;
	status: string;
	summary: string;
	summaryJson?: string;
	planJson: string;
	stepsJson?: string;
	probeSummary?: string;
	validationJson?: string;
	contextEventsJson?: string;
	durationMs: number;
}

export interface MemoryRecord {
	id: string;
	type: string;
	key: string;
	value: string;
	confidence: number;
	sourceEpisodeId?: string | null;
	createdAt: number;
	updatedAt: number;
	lastUsedAt?: number | null;
	active: boolean;
}

export interface RawContextEventInput {
	id?: string;
	type: string;
	source: string;
	timestamp: number;
	data: Record<string, unknown>;
}

let db: Database.Database | null = null;

function getDb(dataDir?: string): Database.Database {
	if (db) return db;
	const dir = (dataDir ?? process.env.FOLD_DATA_DIR ?? join(homedir(), ".fold")).replace(
		/^~/,
		homedir(),
	);
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const path = join(dir, "fold.db");
	db = new Database(path);
	db.exec(`
    CREATE TABLE IF NOT EXISTS episodes (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      intent TEXT NOT NULL,
      goal TEXT,
      status TEXT,
      summary TEXT,
      plan_json TEXT,
      duration_ms INTEGER
    );
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      key TEXT NOT NULL,
      value TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0.8,
      source_episode_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      last_used_at INTEGER,
      active INTEGER NOT NULL DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS context_events (
      id TEXT PRIMARY KEY,
      timestamp INTEGER NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      data_json TEXT NOT NULL,
      retention_tier TEXT NOT NULL DEFAULT 'raw'
    );
    CREATE INDEX IF NOT EXISTS idx_episodes_timestamp ON episodes(timestamp);
    CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
    CREATE INDEX IF NOT EXISTS idx_context_events_timestamp ON context_events(timestamp);
  `);
	ensureColumn(db, "episodes", "summary_json", "TEXT");
	ensureColumn(db, "episodes", "steps_json", "TEXT");
	ensureColumn(db, "episodes", "probe_summary", "TEXT");
	ensureColumn(db, "episodes", "validation_json", "TEXT");
	ensureColumn(db, "episodes", "context_events_json", "TEXT");
	return db;
}

export function saveContextEvent(event: RawContextEventInput, dataDir?: string): void {
	const conn = getDb(dataDir);
	conn
		.prepare(
			`INSERT OR REPLACE INTO context_events (id, timestamp, type, source, data_json, retention_tier)
			 VALUES (?, ?, ?, ?, ?, ?)`,
		)
		.run(
			event.id ?? randomUUID(),
			event.timestamp,
			event.type,
			event.source,
			JSON.stringify(event.data),
			"raw",
		);
}

function ensureColumn(conn: Database.Database, table: string, column: string, type: string) {
	const rows = conn.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
	if (!rows.some((row) => row.name === column)) {
		conn.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
	}
}

function asJson(value: unknown): string {
	return JSON.stringify(value ?? null);
}

function buildSummary(input: {
	intent: string;
	goal: string;
	steps: EpisodeStep[];
	status: string;
	userVisibleResult?: string;
	validationChecks?: Array<{ rule: string; passed: boolean; message?: string }>;
	contextEvents?: Array<{ type?: string; source?: string; data?: Record<string, unknown> }>;
}): EpisodeSummary {
	const events = input.contextEvents ?? [];
	return {
		intent: input.intent,
		goal: input.goal,
		outcome: input.status,
		userVisibleResult:
			input.userVisibleResult ??
			input.steps
				.filter((s) => s.status === "success")
				.map((s) => s.skill)
				.join(", "),
		apps: [...new Set(events.map((e) => e.data?.appName).filter((v): v is string => Boolean(v)))],
		files: [...new Set(events.map((e) => e.data?.filePath).filter((v): v is string => Boolean(v)))],
		urls: [...new Set(events.map((e) => e.data?.url).filter((v): v is string => Boolean(v)))],
		skills: input.steps.map((s) => s.skill),
		failures: input.steps.filter((s) => s.status !== "success").map((s) => s.error ?? s.skill),
		validationChecks: input.validationChecks ?? [],
	};
}

export function saveEpisode(
	input: {
		intent: string;
		goal: string;
		plan: ActionPlan;
		steps: EpisodeStep[];
		status: string;
		userVisibleResult?: string;
		probeSummary?: string;
		validationChecks?: Array<{ rule: string; passed: boolean; message?: string }>;
		contextEvents?: Array<{ type?: string; source?: string; data?: Record<string, unknown> }>;
	},
	dataDir?: string,
): Episode {
	const conn = getDb(dataDir);
	const id = randomUUID();
	const timestamp = Date.now();
	const durationMs = input.steps.reduce((a, s) => a + s.durationMs, 0);
	const summaryObj = buildSummary(input);
	const summary = summaryObj.userVisibleResult;
	const summaryJson = asJson(summaryObj);
	const planJson = JSON.stringify(input.plan);
	const stepsJson = asJson(input.steps);
	const validationJson = asJson(input.validationChecks ?? []);
	const contextEventsJson = asJson(input.contextEvents ?? []);

	conn
		.prepare(
			`INSERT INTO episodes (
				id, timestamp, intent, goal, status, summary, summary_json, plan_json, steps_json,
				probe_summary, validation_json, context_events_json, duration_ms
			)
     		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		)
		.run(
			id,
			timestamp,
			input.intent,
			input.goal,
			input.status,
			summary,
			summaryJson,
			planJson,
			stepsJson,
			input.probeSummary ?? null,
			validationJson,
			contextEventsJson,
			durationMs,
		);

	return {
		id,
		timestamp,
		intent: input.intent,
		goal: input.goal,
		status: input.status,
		summary,
		summaryJson,
		planJson,
		stepsJson,
		probeSummary: input.probeSummary,
		validationJson,
		contextEventsJson,
		durationMs,
	};
}

export function listRecentEpisodes(limit = 5, dataDir?: string): Episode[] {
	const conn = getDb(dataDir);
	return conn
		.prepare(`SELECT * FROM episodes ORDER BY timestamp DESC LIMIT ?`)
		.all(limit) as Episode[];
}
