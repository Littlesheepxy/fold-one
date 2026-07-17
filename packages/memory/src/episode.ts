import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import type { ActionPlan } from "@fold/ai";
import { classifyTaskClass, clusterKeyFromSkills } from "./task-shape.js";

export interface EpisodeStep {
	stepId: string;
	skill: string;
	status: string;
	durationMs: number;
	error?: string;
	/** 展示用步骤名（含渠道，如「飞书 CLI」） */
	label?: string;
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
	thinkingText?: string;
	resultDetail?: string;
	agentEventsJson?: string;
	artifactsJson?: string;
	memoryCandidatesJson?: string;
	taskMomentJson?: string;
	clusterKey?: string;
	taskClass?: string;
	durationMs: number;
}

export interface EpisodeSummaryRow {
	id: string;
	intent: string;
	status: string;
	timestamp: number;
	summary: string;
	durationMs: number;
}

type EpisodeRow = {
	id: string;
	timestamp: number;
	intent: string;
	goal: string | null;
	status: string | null;
	summary: string | null;
	summary_json: string | null;
	plan_json: string | null;
	steps_json: string | null;
	probe_summary: string | null;
	validation_json: string | null;
	context_events_json: string | null;
	thinking_text: string | null;
	result_detail: string | null;
	agent_events_json: string | null;
	artifacts_json: string | null;
	memory_candidates_json: string | null;
	task_moment_json: string | null;
	cluster_key: string | null;
	task_class: string | null;
	duration_ms: number | null;
};

function mapEpisodeRow(row: EpisodeRow): Episode {
	return {
		id: row.id,
		timestamp: row.timestamp,
		intent: row.intent,
		goal: row.goal ?? "",
		status: row.status ?? "",
		summary: row.summary ?? "",
		summaryJson: row.summary_json ?? undefined,
		planJson: row.plan_json ?? "{}",
		stepsJson: row.steps_json ?? undefined,
		probeSummary: row.probe_summary ?? undefined,
		validationJson: row.validation_json ?? undefined,
		contextEventsJson: row.context_events_json ?? undefined,
		thinkingText: row.thinking_text ?? undefined,
		resultDetail: row.result_detail ?? undefined,
		agentEventsJson: row.agent_events_json ?? undefined,
		artifactsJson: row.artifacts_json ?? undefined,
		memoryCandidatesJson: row.memory_candidates_json ?? undefined,
		taskMomentJson: row.task_moment_json ?? undefined,
		clusterKey: row.cluster_key ?? undefined,
		taskClass: row.task_class ?? undefined,
		durationMs: row.duration_ms ?? 0,
	};
}

const EPISODE_SELECT = `
	SELECT id, timestamp, intent, goal, status, summary, summary_json, plan_json, steps_json,
		probe_summary, validation_json, context_events_json, thinking_text, result_detail,
		agent_events_json, artifacts_json, memory_candidates_json, task_moment_json,
		cluster_key, task_class, duration_ms
	FROM episodes`;

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
let dbDir: string | null = null;

export function getDb(dataDir?: string): Database.Database {
	const dir = (dataDir ?? process.env.FOLD_DATA_DIR ?? join(homedir(), ".fold")).replace(
		/^~/,
		homedir(),
	);
	if (db && dbDir === dir) return db;
	if (db) {
		try {
			db.close();
		} catch {
			/* ignore */
		}
		db = null;
	}
	dbDir = dir;
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
	ensureColumn(db, "episodes", "thinking_text", "TEXT");
	ensureColumn(db, "episodes", "result_detail", "TEXT");
	ensureColumn(db, "episodes", "agent_events_json", "TEXT");
	ensureColumn(db, "episodes", "artifacts_json", "TEXT");
	ensureColumn(db, "episodes", "memory_candidates_json", "TEXT");
	ensureColumn(db, "episodes", "task_moment_json", "TEXT");
	ensureColumn(db, "episodes", "cluster_key", "TEXT");
	ensureColumn(db, "episodes", "task_class", "TEXT");
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

const CONTEXT_EVENT_RETENTION_MS = 4 * 60 * 60 * 1000;

export type ContextEventRow = {
	id: string;
	type: string;
	source: string;
	timestamp: number;
	data: Record<string, unknown>;
};

function mapContextEventRows(
	rows: Array<{
		id: string;
		timestamp: number;
		type: string;
		source: string;
		data_json: string;
	}>,
): ContextEventRow[] {
	return rows.map((row) => ({
		id: row.id,
		timestamp: row.timestamp,
		type: row.type,
		source: row.source,
		data: JSON.parse(row.data_json) as Record<string, unknown>,
	}));
}

export function listContextEvents(
	limit = 400,
	dataDir?: string,
	sinceMs = Date.now() - CONTEXT_EVENT_RETENTION_MS,
): ContextEventRow[] {
	const conn = getDb(dataDir);
	const rows = conn
		.prepare(
			`SELECT id, timestamp, type, source, data_json
			 FROM context_events
			 WHERE timestamp >= ?
			 ORDER BY timestamp DESC
			 LIMIT ?`,
		)
		.all(sinceMs, limit) as Array<{
		id: string;
		timestamp: number;
		type: string;
		source: string;
		data_json: string;
	}>;

	return mapContextEventRows(rows.reverse());
}

/** 按时间范围拉取 context_events（整固用，不受 4 小时窗口限制）。 */
export function listContextEventsInRange(
	startMs: number,
	endMs: number,
	dataDir?: string,
): ContextEventRow[] {
	const conn = getDb(dataDir);
	const rows = conn
		.prepare(
			`SELECT id, timestamp, type, source, data_json
			 FROM context_events
			 WHERE timestamp >= ? AND timestamp <= ?
			 ORDER BY timestamp ASC`,
		)
		.all(startMs, endMs) as Array<{
		id: string;
		timestamp: number;
		type: string;
		source: string;
		data_json: string;
	}>;
	return mapContextEventRows(rows);
}

export interface ClipboardHistoryRow {
	id: string;
	timestamp: number;
	text: string;
	appName: string | null;
	windowTitle: string | null;
	appPath: string | null;
}

/** 从 context_events 提取用户复制记录，供召回与展示。 */
export function listClipboardHistory(
	limit = 50,
	dataDir?: string,
	sinceMs = Date.now() - CONTEXT_EVENT_RETENTION_MS,
): ClipboardHistoryRow[] {
	const events = listContextEvents(limit * 4, dataDir, sinceMs).filter(
		(e) => e.type === "clipboard.changed",
	);
	const items: ClipboardHistoryRow[] = [];
	let lastText = "";
	for (const event of events) {
		if (event.data.origin === "fold") continue;
		const text = typeof event.data.text === "string" ? event.data.text.trim() : "";
		if (text.length < 4 || text === lastText) continue;
		lastText = text;
		items.push({
			id: event.id,
			timestamp: event.timestamp,
			text,
			appName: typeof event.data.appName === "string" ? event.data.appName : null,
			windowTitle: typeof event.data.windowTitle === "string" ? event.data.windowTitle : null,
			appPath: typeof event.data.appPath === "string" ? event.data.appPath : null,
		});
	}
	return items.slice(-limit).reverse();
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
		thinkingText?: string;
		resultDetail?: string;
		agentEvents?: unknown[];
		artifacts?: unknown[];
		/** Stored for review only; saveEpisode never promotes these into active memories. */
		memoryCandidates?: unknown[];
		/** Task-scoped voice/clipboard/AX context with raw-event provenance. */
		taskMoment?: unknown;
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
	const agentEventsJson = asJson(input.agentEvents ?? []);
	const artifactsJson = asJson(input.artifacts ?? []);
	const memoryCandidatesJson = asJson(input.memoryCandidates ?? []);
	const taskMomentJson = asJson(input.taskMoment ?? null);
	const skills = input.steps.map((s) => s.skill);
	const clusterKey = clusterKeyFromSkills(skills);
	const taskClass = classifyTaskClass(input.intent, skills);

	conn
		.prepare(
			`INSERT INTO episodes (
				id, timestamp, intent, goal, status, summary, summary_json, plan_json, steps_json,
				probe_summary, validation_json, context_events_json, thinking_text, result_detail,
				agent_events_json, artifacts_json, memory_candidates_json, task_moment_json,
				cluster_key, task_class, duration_ms
			)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
			input.thinkingText ?? null,
			input.resultDetail ?? null,
			agentEventsJson,
			artifactsJson,
			memoryCandidatesJson,
			taskMomentJson,
			clusterKey || null,
			taskClass,
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
		thinkingText: input.thinkingText,
		resultDetail: input.resultDetail,
		agentEventsJson,
		artifactsJson,
		memoryCandidatesJson,
		taskMomentJson,
		clusterKey: clusterKey || undefined,
		taskClass,
		durationMs,
	};
}

export function listRecentEpisodes(limit = 5, dataDir?: string): Episode[] {
	const conn = getDb(dataDir);
	return conn
		.prepare(`${EPISODE_SELECT} ORDER BY timestamp DESC LIMIT ?`)
		.all(limit)
		.map((row) => mapEpisodeRow(row as EpisodeRow));
}

/** 按时间范围拉取 episodes（整固用）。 */
export function listEpisodesInRange(startMs: number, endMs: number, dataDir?: string): Episode[] {
	const conn = getDb(dataDir);
	return conn
		.prepare(`${EPISODE_SELECT} WHERE timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC`)
		.all(startMs, endMs)
		.map((row) => mapEpisodeRow(row as EpisodeRow));
}

export function listEpisodeSummaries(limit = 50, dataDir?: string): EpisodeSummaryRow[] {
	const conn = getDb(dataDir);
	return conn
		.prepare(
			`SELECT id, intent, status, timestamp, summary, duration_ms as durationMs
			 FROM episodes ORDER BY timestamp DESC LIMIT ?`,
		)
		.all(limit) as EpisodeSummaryRow[];
}

export function getEpisodeById(id: string, dataDir?: string): Episode | null {
	const conn = getDb(dataDir);
	const row = conn.prepare(`${EPISODE_SELECT} WHERE id = ?`).get(id) as EpisodeRow | undefined;
	return row ? mapEpisodeRow(row) : null;
}
