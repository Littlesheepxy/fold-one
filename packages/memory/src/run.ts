import { randomUUID } from "node:crypto";
import type { ActionPlan } from "@fold/ai";
import { getDb } from "./episode.js";

export type TaskRunStatus =
	| "running"
	| "success"
	| "partial"
	| "failed"
	| "canceled";

export interface TaskRunRecord {
	id: string;
	intent: string;
	status: TaskRunStatus;
	phase: string;
	plan?: ActionPlan;
	taskMoment?: unknown;
	episodeId?: string;
	agentSessionId?: string;
	result?: unknown;
	error?: string;
	createdAt: number;
	updatedAt: number;
	completedAt?: number;
}

export interface TaskCheckpoint {
	id: string;
	runId: string;
	sequence: number;
	phase: string;
	stepId?: string;
	skill?: string;
	status?: string;
	payload?: unknown;
	at: number;
}

export type RunEventType =
	| "run.created"
	| "plan.created"
	| "step.scheduled"
	| "step.started"
	| "action.requested"
	| "policy.decided"
	| "approval.requested"
	| "approval.resolved"
	| "action.observed"
	| "step.completed"
	| "step.failed"
	| "step.skipped"
	| "worker.session.bound"
	| "memory.candidate.created"
	| "run.canceled"
	| "run.completed"
	| "phase.changed";

export interface RunEvent<T = unknown> {
	id: string;
	runId: string;
	sequence: number;
	type: RunEventType;
	causationId?: string;
	correlationId?: string;
	schemaVersion: number;
	payload: T;
	at: number;
}

export interface TaskRunState {
	runId: string;
	status: TaskRunStatus;
	phase: string;
	plan?: ActionPlan;
	steps: Record<string, { skill?: string; status: string; output?: unknown; error?: string }>;
	workerSessionId?: string;
	lastSequence: number;
}

export interface SideEffectReceipt {
	effectId: string;
	runId: string;
	idempotencyKey: string;
	connector: string;
	operation: string;
	targetFingerprint: string;
	inputHash: string;
	status: "requested" | "confirmed" | "uncertain" | "failed";
	externalRef?: string;
	verification?: unknown;
	inverseAction?: unknown;
	createdAt: number;
	updatedAt: number;
}

type TaskRunRow = {
	id: string;
	intent: string;
	status: TaskRunStatus;
	phase: string;
	plan_json: string | null;
	task_moment_json: string | null;
	episode_id: string | null;
	agent_session_id: string | null;
	result_json: string | null;
	error: string | null;
	created_at: number;
	updated_at: number;
	completed_at: number | null;
};

type CheckpointRow = {
	id: string;
	run_id: string;
	sequence: number;
	phase: string;
	step_id: string | null;
	skill: string | null;
	status: string | null;
	payload_json: string | null;
	at: number;
};

type RunEventRow = {
	id: string; run_id: string; sequence: number; type: RunEventType;
	causation_id: string | null; correlation_id: string | null;
	schema_version: number; payload_json: string | null; at: number;
};

type SideEffectReceiptRow = {
	effect_id: string; run_id: string; idempotency_key: string; connector: string;
	operation: string; target_fingerprint: string; input_hash: string;
	status: SideEffectReceipt["status"]; external_ref: string | null;
	verification_json: string | null; inverse_action_json: string | null;
	created_at: number; updated_at: number;
};

function ensureRunTables(dataDir?: string): void {
	const conn = getDb(dataDir);
	conn.exec(`
		CREATE TABLE IF NOT EXISTS task_runs (
			id TEXT PRIMARY KEY,
			intent TEXT NOT NULL,
			status TEXT NOT NULL,
			phase TEXT NOT NULL,
			plan_json TEXT,
			task_moment_json TEXT,
			episode_id TEXT,
			agent_session_id TEXT,
			result_json TEXT,
			error TEXT,
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL,
			completed_at INTEGER
		);
		CREATE TABLE IF NOT EXISTS task_checkpoints (
			id TEXT PRIMARY KEY,
			run_id TEXT NOT NULL,
			sequence INTEGER NOT NULL,
			phase TEXT NOT NULL,
			step_id TEXT,
			skill TEXT,
			status TEXT,
			payload_json TEXT,
			at INTEGER NOT NULL,
			UNIQUE(run_id, sequence)
		);
		CREATE INDEX IF NOT EXISTS idx_task_runs_updated_at ON task_runs(updated_at);
		CREATE INDEX IF NOT EXISTS idx_task_checkpoints_run_sequence
			ON task_checkpoints(run_id, sequence);
		CREATE TABLE IF NOT EXISTS task_run_events (
			id TEXT PRIMARY KEY, run_id TEXT NOT NULL, sequence INTEGER NOT NULL,
			type TEXT NOT NULL, causation_id TEXT, correlation_id TEXT,
			schema_version INTEGER NOT NULL DEFAULT 1, payload_json TEXT, at INTEGER NOT NULL,
			UNIQUE(run_id, sequence)
		);
		CREATE INDEX IF NOT EXISTS idx_task_run_events_run_sequence
			ON task_run_events(run_id, sequence);
		CREATE TABLE IF NOT EXISTS side_effect_receipts (
			effect_id TEXT PRIMARY KEY, run_id TEXT NOT NULL, idempotency_key TEXT NOT NULL UNIQUE,
			connector TEXT NOT NULL, operation TEXT NOT NULL, target_fingerprint TEXT NOT NULL,
			input_hash TEXT NOT NULL, status TEXT NOT NULL, external_ref TEXT,
			verification_json TEXT, inverse_action_json TEXT,
			created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_side_effect_receipts_run ON side_effect_receipts(run_id);
	`);
}

function parseJson(value: string | null): unknown | undefined {
	if (!value) return undefined;
	try {
		return JSON.parse(value) as unknown;
	} catch {
		return undefined;
	}
}

const MAX_STORED_JSON_CHARS = 512_000;

function serializeJson(value: unknown): string | null {
	if (value === undefined) return null;
	try {
		const serialized = JSON.stringify(value);
		if (serialized.length <= MAX_STORED_JSON_CHARS) return serialized;
		return JSON.stringify({
			truncated: true,
			originalChars: serialized.length,
			preview: serialized.slice(0, MAX_STORED_JSON_CHARS),
		});
	} catch (error) {
		return JSON.stringify({
			unserializable: true,
			error: error instanceof Error ? error.message : String(error),
		});
	}
}

function mapRun(row: TaskRunRow): TaskRunRecord {
	return {
		id: row.id,
		intent: row.intent,
		status: row.status,
		phase: row.phase,
		plan: parseJson(row.plan_json) as ActionPlan | undefined,
		taskMoment: parseJson(row.task_moment_json),
		episodeId: row.episode_id ?? undefined,
		agentSessionId: row.agent_session_id ?? undefined,
		result: parseJson(row.result_json),
		error: row.error ?? undefined,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
		completedAt: row.completed_at ?? undefined,
	};
}

function mapCheckpoint(row: CheckpointRow): TaskCheckpoint {
	return {
		id: row.id,
		runId: row.run_id,
		sequence: row.sequence,
		phase: row.phase,
		stepId: row.step_id ?? undefined,
		skill: row.skill ?? undefined,
		status: row.status ?? undefined,
		payload: parseJson(row.payload_json),
		at: row.at,
	};
}

export function startTaskRun(
	input: { id: string; intent: string; taskMoment?: unknown; phase?: string },
	dataDir?: string,
): TaskRunRecord {
	ensureRunTables(dataDir);
	const now = Date.now();
	getDb(dataDir)
		.prepare(
			`INSERT INTO task_runs (
				id, intent, status, phase, task_moment_json, created_at, updated_at
			) VALUES (?, ?, 'running', ?, ?, ?, ?)`,
		)
		.run(
			input.id,
			input.intent,
			input.phase ?? "starting",
			serializeJson(input.taskMoment),
			now,
			now,
		);
	appendRunEvent({ runId: input.id, type: "run.created", payload: {
		intent: input.intent,
		taskMoment: input.taskMoment,
	} }, dataDir);
	return getTaskRun(input.id, dataDir)!;
}

export function appendRunEvent<T>(
	input: Omit<RunEvent<T>, "id" | "sequence" | "schemaVersion" | "at"> & {
		id?: string; schemaVersion?: number; at?: number;
	},
	dataDir?: string,
): RunEvent<T> {
	ensureRunTables(dataDir);
	const conn = getDb(dataDir);
	return conn.transaction(() => {
		const next = conn.prepare(
			"SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM task_run_events WHERE run_id = ?",
		).get(input.runId) as { sequence: number };
		const event: RunEvent<T> = {
			id: input.id ?? randomUUID(), runId: input.runId, sequence: next.sequence,
			type: input.type, causationId: input.causationId,
			correlationId: input.correlationId, schemaVersion: input.schemaVersion ?? 1,
			payload: input.payload, at: input.at ?? Date.now(),
		};
		conn.prepare(`INSERT INTO task_run_events
			(id, run_id, sequence, type, causation_id, correlation_id, schema_version, payload_json, at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
		).run(event.id, event.runId, event.sequence, event.type, event.causationId ?? null,
			event.correlationId ?? null, event.schemaVersion, serializeJson(event.payload), event.at);
		return event;
	})();
}

export function listRunEvents(runId: string, dataDir?: string): RunEvent[] {
	ensureRunTables(dataDir);
	const rows = getDb(dataDir).prepare(
		"SELECT * FROM task_run_events WHERE run_id = ? ORDER BY sequence ASC",
	).all(runId) as RunEventRow[];
	return rows.map((row) => ({
		id: row.id, runId: row.run_id, sequence: row.sequence, type: row.type,
		causationId: row.causation_id ?? undefined, correlationId: row.correlation_id ?? undefined,
		schemaVersion: row.schema_version, payload: parseJson(row.payload_json), at: row.at,
	}));
}

export function reduceRunEvents(events: RunEvent[]): TaskRunState | null {
	if (!events.length) return null;
	const state: TaskRunState = {
		runId: events[0]!.runId, status: "running", phase: "starting", steps: {}, lastSequence: 0,
	};
	for (const event of events) {
		state.lastSequence = event.sequence;
		const payload = (event.payload ?? {}) as Record<string, unknown>;
		const stepId = typeof payload.stepId === "string" ? payload.stepId : undefined;
		if (event.type === "plan.created") { state.plan = payload.plan as ActionPlan; state.phase = "planned"; }
		if (event.type === "step.started" && stepId) {
			state.phase = "executing";
			state.steps[stepId] = { skill: String(payload.skill ?? ""), status: "running" };
		}
		if ((event.type === "step.completed" || event.type === "step.failed" || event.type === "step.skipped") && stepId) {
			state.steps[stepId] = {
				skill: String(payload.skill ?? state.steps[stepId]?.skill ?? ""),
				status: event.type === "step.completed" ? "success" : event.type === "step.skipped" ? "skipped" : "failed",
				output: payload.output, error: typeof payload.error === "string" ? payload.error : undefined,
			};
		}
		if (event.type === "worker.session.bound" && typeof payload.sessionId === "string") state.workerSessionId = payload.sessionId;
		if (event.type === "run.canceled") { state.status = "canceled"; state.phase = "canceled"; }
		if (event.type === "run.completed") {
			state.status = payload.status === "partial" ? "partial" : payload.status === "failed" ? "failed" : "success";
			state.phase = "completed";
		}
	}
	return state;
}

export function getReducedTaskRunState(runId: string, dataDir?: string): TaskRunState | null {
	return reduceRunEvents(listRunEvents(runId, dataDir));
}

export function getTaskRun(id: string, dataDir?: string): TaskRunRecord | null {
	ensureRunTables(dataDir);
	const row = getDb(dataDir)
		.prepare("SELECT * FROM task_runs WHERE id = ?")
		.get(id) as TaskRunRow | undefined;
	return row ? mapRun(row) : null;
}

export function updateTaskRun(
	id: string,
	patch: Partial<
		Pick<
			TaskRunRecord,
			| "status"
			| "phase"
			| "plan"
			| "taskMoment"
			| "episodeId"
			| "agentSessionId"
			| "result"
			| "error"
			| "completedAt"
		>
	>,
	dataDir?: string,
): TaskRunRecord | null {
	const current = getTaskRun(id, dataDir);
	if (!current) return null;
	const next = { ...current, ...patch, updatedAt: Date.now() };
	getDb(dataDir)
		.prepare(
			`UPDATE task_runs SET
				status = ?, phase = ?, plan_json = ?, task_moment_json = ?, episode_id = ?,
				agent_session_id = ?, result_json = ?, error = ?, updated_at = ?, completed_at = ?
			WHERE id = ?`,
		)
		.run(
			next.status,
			next.phase,
			serializeJson(next.plan),
			serializeJson(next.taskMoment),
			next.episodeId ?? null,
			next.agentSessionId ?? null,
			serializeJson(next.result),
			next.error ?? null,
			next.updatedAt,
			next.completedAt ?? null,
			id,
		);
	// phase 变化落一条时间戳事件：之前 task_runs.phase 只存"当前值"，被反复覆盖，
	// 测不出某个 phase（如 planning）停留了多久（T5 压测需要这个客观时长）。
	if (patch.phase && patch.phase !== current.phase) {
		appendRunEvent(
			{ runId: id, type: "phase.changed", payload: { from: current.phase, to: patch.phase } },
			dataDir,
		);
	}
	return getTaskRun(id, dataDir);
}

/** 按时间窗拉取最近的 task run（压测/埋点报告用）。 */
export function listTaskRunsInRange(startMs: number, endMs: number, dataDir?: string): TaskRunRecord[] {
	ensureRunTables(dataDir);
	const rows = getDb(dataDir)
		.prepare("SELECT * FROM task_runs WHERE created_at >= ? AND created_at <= ? ORDER BY created_at ASC")
		.all(startMs, endMs) as TaskRunRow[];
	return rows.map(mapRun);
}

export function saveTaskCheckpoint(
	input: Omit<TaskCheckpoint, "id" | "sequence" | "at"> & { at?: number },
	dataDir?: string,
): TaskCheckpoint {
	ensureRunTables(dataDir);
	const conn = getDb(dataDir);
	const insert = conn.transaction(() => {
		const row = conn
			.prepare(
				"SELECT COALESCE(MAX(sequence), 0) + 1 AS sequence FROM task_checkpoints WHERE run_id = ?",
			)
			.get(input.runId) as { sequence: number };
		const checkpoint: TaskCheckpoint = {
			id: randomUUID(),
			runId: input.runId,
			sequence: row.sequence,
			phase: input.phase,
			stepId: input.stepId,
			skill: input.skill,
			status: input.status,
			payload: input.payload,
			at: input.at ?? Date.now(),
		};
		conn.prepare(
			`INSERT INTO task_checkpoints (
				id, run_id, sequence, phase, step_id, skill, status, payload_json, at
			) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		).run(
			checkpoint.id,
			checkpoint.runId,
			checkpoint.sequence,
			checkpoint.phase,
			checkpoint.stepId ?? null,
			checkpoint.skill ?? null,
			checkpoint.status ?? null,
			serializeJson(checkpoint.payload),
			checkpoint.at,
		);
		return checkpoint;
	});
	const checkpoint = insert();
	const eventType: RunEventType =
		checkpoint.phase === "step_started" ? "step.started" :
		checkpoint.phase === "step_completed" ? "step.completed" :
		checkpoint.phase === "step_skipped" ? "step.skipped" : "step.failed";
	appendRunEvent({
		runId: checkpoint.runId,
		type: eventType,
		correlationId: checkpoint.stepId,
		payload: {
			stepId: checkpoint.stepId,
			skill: checkpoint.skill,
			status: checkpoint.status,
			...(checkpoint.payload && typeof checkpoint.payload === "object"
				? checkpoint.payload as Record<string, unknown> : {}),
		},
	}, dataDir);
	return checkpoint;
}

export function listTaskCheckpoints(runId: string, dataDir?: string): TaskCheckpoint[] {
	ensureRunTables(dataDir);
	const rows = getDb(dataDir)
		.prepare("SELECT * FROM task_checkpoints WHERE run_id = ? ORDER BY sequence ASC")
		.all(runId) as CheckpointRow[];
	return rows.map(mapCheckpoint);
}

function mapReceipt(row: SideEffectReceiptRow): SideEffectReceipt {
	return {
		effectId: row.effect_id, runId: row.run_id, idempotencyKey: row.idempotency_key,
		connector: row.connector, operation: row.operation,
		targetFingerprint: row.target_fingerprint, inputHash: row.input_hash,
		status: row.status, externalRef: row.external_ref ?? undefined,
		verification: parseJson(row.verification_json), inverseAction: parseJson(row.inverse_action_json),
		createdAt: row.created_at, updatedAt: row.updated_at,
	};
}

export function getSideEffectReceipt(idempotencyKey: string, dataDir?: string): SideEffectReceipt | null {
	ensureRunTables(dataDir);
	const row = getDb(dataDir).prepare(
		"SELECT * FROM side_effect_receipts WHERE idempotency_key = ?",
	).get(idempotencyKey) as SideEffectReceiptRow | undefined;
	return row ? mapReceipt(row) : null;
}

export function upsertSideEffectReceipt(
	input: Omit<SideEffectReceipt, "effectId" | "createdAt" | "updatedAt"> & { effectId?: string },
	dataDir?: string,
): SideEffectReceipt {
	ensureRunTables(dataDir);
	const conn = getDb(dataDir);
	const existing = getSideEffectReceipt(input.idempotencyKey, dataDir);
	const now = Date.now();
	const effectId = existing?.effectId ?? input.effectId ?? randomUUID();
	conn.prepare(`INSERT INTO side_effect_receipts
		(effect_id, run_id, idempotency_key, connector, operation, target_fingerprint, input_hash,
		 status, external_ref, verification_json, inverse_action_json, created_at, updated_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(idempotency_key) DO UPDATE SET
		 status=excluded.status, external_ref=excluded.external_ref,
		 verification_json=excluded.verification_json, inverse_action_json=excluded.inverse_action_json,
		 updated_at=excluded.updated_at`
	).run(effectId, input.runId, input.idempotencyKey, input.connector, input.operation,
		input.targetFingerprint, input.inputHash, input.status, input.externalRef ?? null,
		serializeJson(input.verification), serializeJson(input.inverseAction), existing?.createdAt ?? now, now);
	return getSideEffectReceipt(input.idempotencyKey, dataDir)!;
}
