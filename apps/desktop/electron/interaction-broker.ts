import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import {
	normalizeUserActionRequest,
	type NormalizedUserActionRequest,
	type UserActionRequest,
	type UserActionResponse,
	type UserInteractionView,
} from "@fold/runtime";

export type InteractionEventType =
	| "interaction.requested"
	| "run.paused"
	| "interaction.responded"
	| "interaction.canceled"
	| "run.resumed";

export interface InteractionEvent {
	id: string;
	type: InteractionEventType;
	interactionId: string;
	timestamp: number;
	payload?: Record<string, unknown>;
}

export interface PendingInteractionRecord {
	id: string;
	status: "pending";
	request: NormalizedUserActionRequest;
	createdAt: number;
	updatedAt: number;
	intent: string;
	runContext?: Record<string, unknown>;
	presentation?: {
		listening?: boolean;
		draft?: string;
		validationMessage?: string;
	};
}

interface PersistedInteractionState {
	version: 1;
	active: PendingInteractionRecord | null;
	events: InteractionEvent[];
}

export interface InteractionStore {
	load(): PersistedInteractionState;
	save(state: PersistedInteractionState): void;
}

const EMPTY_STATE: PersistedInteractionState = { version: 1, active: null, events: [] };
const MAX_EVENTS = 200;

export class FileInteractionStore implements InteractionStore {
	constructor(private readonly filePath: string) {}

	load(): PersistedInteractionState {
		try {
			const parsed = JSON.parse(readFileSync(this.filePath, "utf8")) as PersistedInteractionState;
			if (parsed.version !== 1 || !Array.isArray(parsed.events)) return { ...EMPTY_STATE };
			return parsed;
		} catch {
			return { ...EMPTY_STATE };
		}
	}

	save(state: PersistedInteractionState): void {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const tempPath = `${this.filePath}.next`;
		writeFileSync(tempPath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
		renameSync(tempPath, this.filePath);
	}
}

interface Continuation {
	interactionId: string;
	resolve: (value: string) => void;
	reject: (error: Error) => void;
}

export interface InteractionResolution {
	record: PendingInteractionRecord;
	wasLive: boolean;
}

export class InteractionBroker {
	private state: PersistedInteractionState;
	private continuation: Continuation | null = null;

	constructor(private readonly store: InteractionStore) {
		this.state = store.load();
	}

	current(): PendingInteractionRecord | null {
		return this.state.active;
	}

	request(request: UserActionRequest, intent: string): Promise<string> {
		if (this.continuation) {
			this.continuation.reject(new Error("交互请求已被新的暂停节点替代"));
			this.continuation = null;
		}
		if (this.state.active) {
			this.append("interaction.canceled", this.state.active.id, { reason: "superseded" });
		}

		const normalized = normalizeUserActionRequest(request);
		const now = Date.now();
		const id = normalized.id?.trim() || randomUUID();
		const record: PendingInteractionRecord = {
			id,
			status: "pending",
			request: { ...normalized, id },
			createdAt: now,
			updatedAt: now,
			intent,
			runContext: normalized.runContext,
		};
		this.state.active = record;
		this.append("interaction.requested", id, {
			kind: normalized.kind,
			risk: normalized.risk,
		});
		this.append("run.paused", id, { intent });
		this.persist();

		return new Promise<string>((resolve, reject) => {
			this.continuation = { interactionId: id, resolve, reject };
		});
	}

	updatePresentation(
		patch: NonNullable<PendingInteractionRecord["presentation"]>,
	): PendingInteractionRecord | null {
		const active = this.state.active;
		if (!active) return null;
		active.presentation = { ...active.presentation, ...patch };
		active.updatedAt = Date.now();
		this.persist();
		return active;
	}

	respond(response: UserActionResponse): InteractionResolution | null {
		const active = this.state.active;
		if (!active) return null;
		if (response.requestId && response.requestId !== active.id) return null;
		const value = response.optionId ?? response.text?.trim();
		if (!value) return null;

		const continuation =
			this.continuation?.interactionId === active.id ? this.continuation : null;
		this.append("interaction.responded", active.id, {
			modality: response.modality,
			optionId: response.optionId,
			hasText: Boolean(response.text?.trim()),
		});
		this.append("run.resumed", active.id, { live: Boolean(continuation) });
		this.state.active = null;
		this.continuation = null;
		this.persist();
		continuation?.resolve(value);
		return { record: active, wasLive: Boolean(continuation) };
	}

	cancel(reason = "用户取消了授权"): InteractionResolution | null {
		const active = this.state.active;
		if (!active) return null;
		const continuation =
			this.continuation?.interactionId === active.id ? this.continuation : null;
		this.append("interaction.canceled", active.id, { reason });
		this.state.active = null;
		this.continuation = null;
		this.persist();
		continuation?.reject(new Error(reason));
		return { record: active, wasLive: Boolean(continuation) };
	}

	private append(
		type: InteractionEventType,
		interactionId: string,
		payload?: Record<string, unknown>,
	): void {
		this.state.events.push({
			id: randomUUID(),
			type,
			interactionId,
			timestamp: Date.now(),
			payload,
		});
		if (this.state.events.length > MAX_EVENTS) {
			this.state.events = this.state.events.slice(-MAX_EVENTS);
		}
	}

	private persist(): void {
		this.store.save(this.state);
	}
}

export function toInteractionView(record: PendingInteractionRecord): UserInteractionView {
	return {
		id: record.id,
		title: record.request.title,
		message: record.request.message,
		hint: record.request.hint,
		options: record.request.options,
		kind: record.request.kind,
		risk: record.request.risk,
		input: record.request.input,
		collapsible: record.request.collapsible,
		createdAt: record.createdAt,
		expiresAt: record.request.expiresAt,
		listening: record.presentation?.listening,
		draft: record.presentation?.draft,
		validationMessage: record.presentation?.validationMessage,
	};
}

export class MemoryInteractionStore implements InteractionStore {
	state: PersistedInteractionState = { ...EMPTY_STATE, events: [] };
	load(): PersistedInteractionState {
		return structuredClone(this.state);
	}
	save(state: PersistedInteractionState): void {
		this.state = structuredClone(state);
	}
}
