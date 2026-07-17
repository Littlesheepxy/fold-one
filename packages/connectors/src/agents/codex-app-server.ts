import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export type JsonRpcId = number | string;

export type JsonRpcMessage = {
	id?: JsonRpcId;
	method?: string;
	params?: unknown;
	result?: unknown;
	error?: { code?: number; message?: string; data?: unknown };
};

export type CodexRemoteStatus =
	| "disabled"
	| "connecting"
	| "connected"
	| "errored"
	| "unknown";

export interface CodexRemoteStatusSnapshot {
	status: CodexRemoteStatus;
	serverName?: string | null;
	environmentId?: string | null;
	error?: string;
}

export interface CodexRemotePairing {
	pairingCode?: string;
	manualPairingCode?: string;
	environmentId?: string;
	expiresAt?: number;
}

export interface CodexRemoteClient {
	clientId: string;
	name?: string;
	lastConnectedAt?: number;
	platform?: string;
}

type Pending = {
	resolve: (value: unknown) => void;
	reject: (error: Error) => void;
};

function isExecutable(path: string): Promise<boolean> {
	return access(path, constants.X_OK)
		.then(() => true)
		.catch(() => false);
}

/** 解析可用的 codex 二进制（PATH / Homebrew / 用户目录）。 */
export async function resolveCodexBinary(): Promise<string | null> {
	const home = homedir();
	const candidates = [
		process.env.CODEX_BIN,
		process.env.FOLD_CODEX_BINARY,
		"/Applications/ChatGPT.app/Contents/Resources/codex",
		"/Applications/Codex.app/Contents/Resources/codex",
		join(home, "Applications", "ChatGPT.app", "Contents", "Resources", "codex"),
		join(home, "Applications", "Codex.app", "Contents", "Resources", "codex"),
		"/opt/homebrew/bin/codex",
		"/usr/local/bin/codex",
		join(home, ".local", "bin", "codex"),
		join(home, ".npm-global", "bin", "codex"),
	].filter((p): p is string => Boolean(p));

	for (const candidate of candidates) {
		if (await isExecutable(candidate)) return candidate;
	}

	// npm 全局包装脚本存在但 vendor 二进制缺失时，仍返回 "codex" 让 PATH 解析；调用方会看到清晰错误
	return "codex";
}

/**
 * Codex App Server JSONL 客户端（stdio）。
 * 用于持久线程执行 + Remote Control RPC。
 */
export class CodexAppServerClient {
	private proc: ChildProcessWithoutNullStreams | null = null;
	private nextId = 1;
	private pending = new Map<JsonRpcId, Pending>();
	private notificationListeners = new Set<(msg: JsonRpcMessage) => void>();
	private ready: Promise<void> | null = null;
	private closed = false;

	constructor(private readonly clientName = "zhigeng_desktop") {}

	async start(): Promise<void> {
		if (this.ready) return this.ready;
		this.ready = this.boot();
		return this.ready;
	}

	private async boot(): Promise<void> {
		const bin = await resolveCodexBinary();
		if (!bin) throw new Error("未找到 Codex CLI");

		this.proc = spawn(bin, ["app-server"], {
			stdio: ["pipe", "pipe", "pipe"],
			env: process.env,
		});
		this.closed = false;

		const rl = createInterface({ input: this.proc.stdout });
		rl.on("line", (line) => this.onLine(line));

		this.proc.stderr?.on("data", () => {
			/* 噪音丢弃；错误走 JSON-RPC error */
		});
		this.proc.on("exit", (code, signal) => {
			this.rejectAll(new Error(`Codex app-server 已退出 (${code ?? signal ?? "?"})`));
			this.proc = null;
			this.ready = null;
			this.closed = true;
		});

		await this.request("initialize", {
			clientInfo: {
				name: this.clientName,
				title: "知更",
				version: "0.1.0",
			},
			capabilities: {
				experimentalApi: true,
			},
		});
		this.notify("initialized", {});
	}

	isRunning(): boolean {
		return Boolean(this.proc && !this.closed);
	}

	onNotification(listener: (msg: JsonRpcMessage) => void): () => void {
		this.notificationListeners.add(listener);
		return () => this.notificationListeners.delete(listener);
	}

	async request<T = unknown>(method: string, params?: unknown, timeoutMs = 30_000): Promise<T> {
		// boot() itself sends initialize through this method. Waiting on start()
		// unconditionally here would make initialize await the very boot promise
		// that is waiting for initialize, deadlocking every App Server launch.
		if (!this.proc?.stdin.writable) await this.start();
		if (!this.proc?.stdin.writable) throw new Error("Codex app-server 未就绪");

		const id = this.nextId++;
		const payload = { id, method, params: params ?? {} };
		const result = new Promise<T>((resolve, reject) => {
			const timer = setTimeout(() => {
				this.pending.delete(id);
				reject(new Error(`Codex RPC 超时: ${method}`));
			}, timeoutMs);
			this.pending.set(id, {
				resolve: (value) => {
					clearTimeout(timer);
					resolve(value as T);
				},
				reject: (error) => {
					clearTimeout(timer);
					reject(error);
				},
			});
		});
		this.proc.stdin.write(`${JSON.stringify(payload)}\n`);
		return result;
	}

	notify(method: string, params?: unknown): void {
		if (!this.proc?.stdin.writable) return;
		this.proc.stdin.write(`${JSON.stringify({ method, params: params ?? {} })}\n`);
	}

	private onLine(line: string): void {
		const trimmed = line.trim();
		if (!trimmed) return;
		let msg: JsonRpcMessage;
		try {
			msg = JSON.parse(trimmed) as JsonRpcMessage;
		} catch {
			return;
		}

		if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
			const pending = this.pending.get(msg.id);
			if (!pending) return;
			this.pending.delete(msg.id);
			if (msg.error) {
				pending.reject(new Error(msg.error.message || `Codex RPC error ${msg.error.code ?? ""}`));
			} else {
				pending.resolve(msg.result);
			}
			return;
		}

		if (msg.method) {
			for (const listener of this.notificationListeners) listener(msg);
		}
	}

	private rejectAll(error: Error): void {
		for (const pending of this.pending.values()) pending.reject(error);
		this.pending.clear();
	}

	async stop(): Promise<void> {
		if (!this.proc) return;
		this.rejectAll(new Error("Codex app-server 已关闭"));
		this.proc.kill("SIGTERM");
		this.proc = null;
		this.ready = null;
		this.closed = true;
	}

	/** 持久线程（非 ephemeral），手机 Remote Control 可接管。 */
	async startPersistentThread(opts: {
		cwd?: string;
		sandbox?: "readOnly" | "workspaceWrite" | "dangerFullAccess";
		approvalPolicy?: "untrusted" | "onFailure" | "onRequest" | "never";
	}): Promise<string> {
		const result = await this.request<{ thread?: { id?: string } }>("thread/start", {
			cwd: opts.cwd,
			sandbox: opts.sandbox ?? "workspaceWrite",
			approvalPolicy: opts.approvalPolicy ?? "never",
			serviceName: this.clientName,
			// 明确不要 ephemeral：默认持久，可供 Remote Control 查看
		}, 60_000);
		const id = result.thread?.id;
		if (!id) throw new Error("thread/start 未返回 thread.id");
		return id;
	}

	async resumePersistentThread(threadId: string): Promise<string> {
		const result = await this.request<{ thread?: { id?: string } }>(
			"thread/resume",
			{ threadId },
			60_000,
		);
		const id = result.thread?.id;
		if (!id) throw new Error("thread/resume 未返回 thread.id");
		return id;
	}

	async runTurn(input: {
		threadId: string;
		text: string;
		timeoutMs?: number;
		signal?: AbortSignal;
	}): Promise<{ ok: boolean; summary: string; turnStatus?: string }> {
		let agentText = "";
		let turnStatus = "unknown";
		let turnId: string | undefined;
		let interruptRequested = false;

		const off = this.onNotification((msg) => {
			if (msg.method === "item/agentMessage/delta") {
				const delta = (msg.params as { delta?: string } | undefined)?.delta;
				if (typeof delta === "string") agentText += delta;
			}
			if (msg.method === "item/completed") {
				const item = (msg.params as { item?: { type?: string; text?: string } } | undefined)?.item;
				if (item?.type === "agentMessage" && item.text) agentText = item.text;
			}
			if (msg.method === "turn/completed") {
				const turn = (msg.params as { turn?: { status?: string } } | undefined)?.turn;
				turnStatus = turn?.status ?? "completed";
			}
		});

		try {
			const started = await this.request<{ turn?: { id?: string } }>(
				"turn/start",
				{
					threadId: input.threadId,
					input: [{ type: "text", text: input.text }],
				},
				30_000,
			);
			turnId = started.turn?.id;

			const deadline = Date.now() + (input.timeoutMs ?? 180_000);
			while (Date.now() < deadline) {
				if (input.signal?.aborted && !interruptRequested) {
					interruptRequested = true;
					if (turnId) {
						await this.request(
							"turn/interrupt",
							{ threadId: input.threadId, turnId },
							5_000,
						).catch(() => undefined);
					}
					turnStatus = "interrupted";
					break;
				}
				if (turnStatus === "completed" || turnStatus === "failed" || turnStatus === "interrupted") {
					break;
				}
				await new Promise((r) => setTimeout(r, 200));
			}

			const summary = agentText.trim();
			return {
				ok: turnStatus === "completed" && Boolean(summary),
				summary:
					summary ||
					(turnStatus === "failed"
						? "Codex 执行失败"
						: turnStatus === "interrupted"
							? "Codex 任务已取消"
							: "Codex 未返回结果"),
				turnStatus,
			};
		} finally {
			off();
		}
	}

	async remoteControlEnable(ephemeral = false): Promise<CodexRemoteStatusSnapshot> {
		const result = await this.request<Record<string, unknown>>("remoteControl/enable", {
			ephemeral,
		});
		return normalizeRemoteStatus(result);
	}

	async remoteControlDisable(ephemeral = false): Promise<CodexRemoteStatusSnapshot> {
		const result = await this.request<Record<string, unknown>>("remoteControl/disable", {
			ephemeral,
		});
		return normalizeRemoteStatus(result);
	}

	async remoteControlStatus(): Promise<CodexRemoteStatusSnapshot> {
		try {
			const result = await this.request<Record<string, unknown>>("remoteControl/status/read", {});
			return normalizeRemoteStatus(result);
		} catch (error) {
			return {
				status: "unknown",
				error: error instanceof Error ? error.message : String(error),
			};
		}
	}

	async remoteControlStartPairing(manualCode = true): Promise<CodexRemotePairing> {
		const result = await this.request<Record<string, unknown>>("remoteControl/pairing/start", {
			manualCode,
		});
		return {
			pairingCode: typeof result.pairingCode === "string" ? result.pairingCode : undefined,
			manualPairingCode:
				typeof result.manualPairingCode === "string" ? result.manualPairingCode : undefined,
			environmentId: typeof result.environmentId === "string" ? result.environmentId : undefined,
			expiresAt: typeof result.expiresAt === "number" ? result.expiresAt : undefined,
		};
	}

	async remoteControlPairingStatus(input: {
		pairingCode?: string;
		manualPairingCode?: string;
	}): Promise<{ claimed: boolean }> {
		const result = await this.request<{ claimed?: boolean }>("remoteControl/pairing/status", input);
		return { claimed: Boolean(result.claimed) };
	}

	async remoteControlListClients(environmentId: string): Promise<CodexRemoteClient[]> {
		const result = await this.request<{
			clients?: Array<Record<string, unknown>>;
			items?: Array<Record<string, unknown>>;
		}>("remoteControl/client/list", { environmentId, limit: 50 });
		const rows = result.clients ?? result.items ?? [];
		const clients: CodexRemoteClient[] = [];
		for (const row of rows) {
			const clientId =
				(typeof row.clientId === "string" && row.clientId) ||
				(typeof row.id === "string" && row.id) ||
				"";
			if (!clientId) continue;
			clients.push({
				clientId,
				name:
					(typeof row.name === "string" && row.name) ||
					(typeof row.displayName === "string" && row.displayName) ||
					undefined,
				lastConnectedAt:
					typeof row.lastConnectedAt === "number"
						? row.lastConnectedAt
						: typeof row.lastSeenAt === "number"
							? row.lastSeenAt
							: undefined,
				platform: typeof row.platform === "string" ? row.platform : undefined,
			});
		}
		return clients;
	}

	async remoteControlRevokeClient(environmentId: string, clientId: string): Promise<void> {
		await this.request("remoteControl/client/revoke", { environmentId, clientId });
	}
}

function normalizeRemoteStatus(raw: Record<string, unknown>): CodexRemoteStatusSnapshot {
	const statusRaw = typeof raw.status === "string" ? raw.status : "unknown";
	const status: CodexRemoteStatus =
		statusRaw === "disabled" ||
		statusRaw === "connecting" ||
		statusRaw === "connected" ||
		statusRaw === "errored"
			? statusRaw
			: "unknown";
	return {
		status,
		serverName: typeof raw.serverName === "string" ? raw.serverName : null,
		environmentId: typeof raw.environmentId === "string" ? raw.environmentId : null,
		error: typeof raw.error === "string" ? raw.error : undefined,
	};
}

/** 单例：知更主进程共用一个 app-server，便于 Remote Control 与任务共享。 */
let sharedClient: CodexAppServerClient | null = null;

export function getSharedCodexAppServer(): CodexAppServerClient {
	if (!sharedClient) sharedClient = new CodexAppServerClient("zhigeng_desktop");
	return sharedClient;
}

export async function stopSharedCodexAppServer(): Promise<void> {
	if (!sharedClient) return;
	await sharedClient.stop();
	sharedClient = null;
}
