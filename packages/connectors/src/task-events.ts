export type LocalTaskSource = "claude-code" | "codex" | "cursor" | "workbuddy";

export type LocalTaskStatus =
	| "queued"
	| "starting"
	| "working"
	| "waiting_user"
	| "succeeded"
	| "failed"
	| "canceled";

/** Normalized progress event emitted by every local executor. */
export interface LocalTaskEvent {
	taskId: string;
	sequence: number;
	timestamp: number;
	source: LocalTaskSource;
	status: LocalTaskStatus;
	message: string;
	elapsedMs?: number;
	metadata?: Record<string, string | number | boolean>;
}

export interface MemoryCandidate {
	type: "preference" | "project" | "person" | "workflow";
	key: string;
	value: string;
	confidence: number;
	reason?: string;
	/** Candidates are never persisted until Fold or the user explicitly accepts them. */
	requiresConfirmation: true;
}

export interface LocalTaskArtifact {
	type: "file" | "url" | "message" | "record" | "other";
	value: string;
	label?: string;
}

export type LocalTaskEventCallback = (event: LocalTaskEvent) => void;

export function createLocalTaskEmitter(input: {
	taskId: string;
	source: LocalTaskSource;
	onEvent?: LocalTaskEventCallback;
	events: LocalTaskEvent[];
}) {
	let sequence = 0;
	const startedAt = Date.now();
	return (
		status: LocalTaskStatus,
		message: string,
		metadata?: LocalTaskEvent["metadata"],
	): LocalTaskEvent => {
		const event: LocalTaskEvent = {
			taskId: input.taskId,
			sequence: sequence++,
			timestamp: Date.now(),
			source: input.source,
			status,
			message,
			elapsedMs: Date.now() - startedAt,
			metadata,
		};
		input.events.push(event);
		input.onEvent?.(event);
		return event;
	};
}

const MEMORY_PREFIX = "FOLD_MEMORY_CANDIDATE:";
const ARTIFACT_PREFIX = "FOLD_ARTIFACT:";
const MEMORY_TYPES = new Set<MemoryCandidate["type"]>(["preference", "project", "person", "workflow"]);
const ARTIFACT_TYPES = new Set<LocalTaskArtifact["type"]>(["file", "url", "message", "record", "other"]);

function looksSensitive(key: string, value: string): boolean {
	return /password|passwd|secret|token|api[_ -]?key|bearer|private[_ -]?key|credential/i.test(`${key} ${value}`) ||
		/-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(value);
}

/** Parse optional machine-readable return lines without showing them in the user summary. */
export function parseLocalTaskReturn(text: string): {
	summary: string;
	memoryCandidates: MemoryCandidate[];
	artifacts: LocalTaskArtifact[];
} {
	const memoryCandidates: MemoryCandidate[] = [];
	const artifacts: LocalTaskArtifact[] = [];
	const summaryLines: string[] = [];
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (trimmed.startsWith(MEMORY_PREFIX)) {
			try {
				const value = JSON.parse(trimmed.slice(MEMORY_PREFIX.length).trim()) as Partial<MemoryCandidate>;
				if (
					value.type &&
					MEMORY_TYPES.has(value.type) &&
					value.key?.trim() &&
					value.value?.trim() &&
					!looksSensitive(value.key, value.value)
				) {
					memoryCandidates.push({
						type: value.type,
						key: value.key.trim(),
						value: value.value.trim(),
						confidence: Math.max(0, Math.min(1, Number(value.confidence ?? 0.7))),
						reason: value.reason?.trim() || undefined,
						requiresConfirmation: true,
					});
				}
			} catch {
				// Ignore malformed metadata.
			}
			continue;
		}
		if (trimmed.startsWith(ARTIFACT_PREFIX)) {
			try {
				const value = JSON.parse(trimmed.slice(ARTIFACT_PREFIX.length).trim()) as Partial<LocalTaskArtifact>;
				if (value.type && ARTIFACT_TYPES.has(value.type) && value.value?.trim()) {
					artifacts.push({
						type: value.type,
						value: value.value.trim(),
						label: value.label?.trim() || undefined,
					});
				}
			} catch {
				// Ignore malformed metadata.
			}
			continue;
		}
		summaryLines.push(line);
	}
	return {
		summary: summaryLines.join("\n").trim(),
		memoryCandidates,
		artifacts,
	};
}

export const LOCAL_TASK_RETURN_INSTRUCTIONS = `
Finish with a concise summary of the result and evidence.
For each durable user preference or project fact worth remembering, add one final line:
FOLD_MEMORY_CANDIDATE: {"type":"preference|project|person|workflow","key":"short-key","value":"fact","confidence":0.0,"reason":"why useful"}
Only propose durable, non-sensitive memory. Never include secrets, credentials, private message content, or access tokens.
For each concrete output, add one final line:
FOLD_ARTIFACT: {"type":"file|url|message|record|other","value":"path-or-id","label":"short label"}
Do not claim completion without evidence.`;
