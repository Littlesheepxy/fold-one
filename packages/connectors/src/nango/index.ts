import type { MailCountUnreadResult, MailDraftInput, MailDraftResult } from "../mail/types.js";

/**
 * Nango 托管连接器（https://nango.dev），支持两种模式：
 *
 * 1. 本地直连（开发者）：FOLD_NANGO_SECRET_KEY 直接调 Nango API
 * 2. foldhub 中转（分发用户）：FOLD_HUB_API_KEY（tm_ 开头的 foldhub API Key）
 *    调 foldhub 的 /api/fold/nango/* 端点，Secret Key 只存在服务端，
 *    连接按 foldhub 用户隔离
 *
 * 两者都配置时优先本地直连（少一跳）。
 */

const DEFAULT_NANGO_HOST = "https://api.nango.dev";
const DEFAULT_HUB_URL = "https://foldhub.cn";
const GMAIL_INTEGRATION_ID = "google-mail";
const REQUEST_TIMEOUT_MS = 15_000;

export interface NangoConnection {
	connectionId: string;
	providerConfigKey: string;
}

export interface NangoProbe {
	configured: boolean;
	connected: boolean;
	connections: NangoConnection[];
	/** local = Secret Key 直连；hub = foldhub 中转 */
	mode?: "local" | "hub";
	error?: string;
}

function getNangoSecretKey(): string | undefined {
	return process.env.FOLD_NANGO_SECRET_KEY?.trim() || undefined;
}

function getNangoHost(): string {
	return process.env.FOLD_NANGO_HOST?.trim() || DEFAULT_NANGO_HOST;
}

function getHubApiKey(): string | undefined {
	return process.env.FOLD_HUB_API_KEY?.trim() || undefined;
}

function getHubUrl(): string {
	return (process.env.FOLD_HUB_URL?.trim() || DEFAULT_HUB_URL).replace(/\/$/, "");
}

export function getNangoMode(): "local" | "hub" | undefined {
	if (getNangoSecretKey()) return "local";
	if (getHubApiKey()) return "hub";
	return undefined;
}

export function isNangoConfigured(): boolean {
	return getNangoMode() !== undefined;
}

// ---------- 本地直连（Nango API） ----------

async function nangoFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const secretKey = getNangoSecretKey();
	if (!secretKey) throw new Error("Nango 未配置。在设置里填入 Nango Secret Key");
	return fetch(`${getNangoHost()}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${secretKey}`,
			"Content-Type": "application/json",
			...init.headers,
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
}

// ---------- foldhub 中转 ----------

async function hubFetch(path: string, init: RequestInit = {}): Promise<Response> {
	const apiKey = getHubApiKey();
	if (!apiKey) throw new Error("foldhub 未配置。在设置里填入 Fold Hub API Key");
	return fetch(`${getHubUrl()}${path}`, {
		...init,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			...init.headers,
		},
		signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
	});
}

async function readError(res: Response): Promise<string> {
	return (await res.text()).slice(0, 200);
}

// ---------- 统一操作（按模式分派） ----------

export async function listNangoConnections(): Promise<NangoConnection[]> {
	const mode = getNangoMode();
	if (mode === "local") {
		const res = await nangoFetch("/connections");
		if (!res.ok) {
			throw new Error(`Nango 连接列表请求失败 (${res.status}): ${await readError(res)}`);
		}
		const payload = (await res.json()) as {
			connections?: Array<{ connection_id: string; provider_config_key: string }>;
		};
		return (payload.connections ?? []).map((c) => ({
			connectionId: c.connection_id,
			providerConfigKey: c.provider_config_key,
		}));
	}
	if (mode === "hub") {
		const res = await hubFetch("/api/fold/nango/connections");
		if (!res.ok) {
			throw new Error(`foldhub 连接列表请求失败 (${res.status}): ${await readError(res)}`);
		}
		const payload = (await res.json()) as { connections?: NangoConnection[] };
		return payload.connections ?? [];
	}
	throw new Error("Nango 未配置。在设置里填入 Nango Secret Key 或 Fold Hub API Key");
}

export async function probeNango(): Promise<NangoProbe> {
	const mode = getNangoMode();
	if (!mode) {
		return {
			configured: false,
			connected: false,
			connections: [],
			error: "未配置 Nango Secret Key 或 Fold Hub API Key",
		};
	}
	try {
		const connections = await listNangoConnections();
		return { configured: true, connected: connections.length > 0, connections, mode };
	} catch (err) {
		return {
			configured: true,
			connected: false,
			connections: [],
			mode,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** 生成 Nango 托管授权页链接，在浏览器里打开即可完成 OAuth。 */
export async function createNangoConnectLink(allowedIntegrations?: string[]): Promise<string> {
	const mode = getNangoMode();
	if (mode === "local") {
		const res = await nangoFetch("/connect/sessions", {
			method: "POST",
			body: JSON.stringify({
				tags: { end_user_id: "fold-local-user" },
				...(allowedIntegrations?.length ? { allowed_integrations: allowedIntegrations } : {}),
			}),
		});
		if (!res.ok) {
			throw new Error(`Nango 授权会话创建失败 (${res.status}): ${await readError(res)}`);
		}
		const payload = (await res.json()) as { data?: { connect_link?: string } };
		if (!payload.data?.connect_link) {
			throw new Error("Nango 返回中缺少 connect_link");
		}
		return payload.data.connect_link;
	}
	if (mode === "hub") {
		const res = await hubFetch("/api/fold/nango/connect-session", {
			method: "POST",
			body: JSON.stringify(
				allowedIntegrations?.length ? { allowedIntegrations } : {},
			),
		});
		if (!res.ok) {
			throw new Error(`foldhub 授权会话创建失败 (${res.status}): ${await readError(res)}`);
		}
		const payload = (await res.json()) as { connectLink?: string };
		if (!payload.connectLink) {
			throw new Error("foldhub 返回中缺少 connectLink");
		}
		return payload.connectLink;
	}
	throw new Error("Nango 未配置。在设置里填入 Nango Secret Key 或 Fold Hub API Key");
}

/** 调第三方 API（如 Gmail），返回解析后的 JSON。 */
async function nangoProxyRequest(
	providerConfigKey: string,
	method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
	path: string,
	body?: unknown,
): Promise<unknown> {
	const mode = getNangoMode();
	if (mode === "local") {
		const connections = await listNangoConnections();
		const connection = connections.find((c) => c.providerConfigKey === providerConfigKey);
		if (!connection) {
			throw new Error(`Nango 里没有 ${providerConfigKey} 连接。先在连接页点「授权新应用」完成授权`);
		}
		const res = await nangoFetch(`/proxy${path}`, {
			method,
			headers: {
				"Provider-Config-Key": connection.providerConfigKey,
				"Connection-Id": connection.connectionId,
			},
			...(body !== undefined ? { body: JSON.stringify(body) } : {}),
		});
		if (!res.ok) {
			throw new Error(`Nango 代理请求失败 (${res.status}): ${await readError(res)}`);
		}
		return await res.json();
	}
	if (mode === "hub") {
		const res = await hubFetch("/api/fold/nango/proxy", {
			method: "POST",
			body: JSON.stringify({ providerConfigKey, method, path, body }),
		});
		if (!res.ok) {
			throw new Error(`foldhub 代理请求失败 (${res.status}): ${await readError(res)}`);
		}
		const payload = (await res.json()) as { status: number; ok: boolean; data: unknown };
		if (!payload.ok) {
			throw new Error(
				`第三方 API 请求失败 (${payload.status}): ${JSON.stringify(payload.data).slice(0, 200)}`,
			);
		}
		return payload.data;
	}
	throw new Error("Nango 未配置。在设置里填入 Nango Secret Key 或 Fold Hub API Key");
}

export async function hasNangoGmailConnection(): Promise<boolean> {
	if (!isNangoConfigured()) return false;
	try {
		const connections = await listNangoConnections();
		return connections.some((c) => c.providerConfigKey === GMAIL_INTEGRATION_ID);
	} catch {
		return false;
	}
}

/** 收件箱未读数 — Gmail labels.get(INBOX) 的 messagesUnread 是精确值。 */
export async function countGmailUnreadViaNango(): Promise<MailCountUnreadResult> {
	const payload = (await nangoProxyRequest(
		GMAIL_INTEGRATION_ID,
		"GET",
		"/gmail/v1/users/me/labels/INBOX",
	)) as { messagesUnread?: number };
	if (typeof payload.messagesUnread !== "number") {
		throw new Error("Nango Gmail 响应缺少 messagesUnread");
	}
	return { provider: "gmail-nango", count: payload.messagesUnread, backend: "nango" };
}

function toBase64Url(input: string): string {
	return Buffer.from(input, "utf8")
		.toString("base64")
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

/** 通过 Gmail API 创建草稿（存到用户 Gmail 草稿箱）。 */
export async function createGmailDraftViaNango(input: MailDraftInput): Promise<MailDraftResult> {
	const to = input.toEmail ?? input.to;
	const raw = toBase64Url(
		[
			`To: ${to}`,
			`Subject: ${input.subject}`,
			'Content-Type: text/plain; charset="UTF-8"',
			"",
			input.body,
		].join("\r\n"),
	);
	await nangoProxyRequest(GMAIL_INTEGRATION_ID, "POST", "/gmail/v1/users/me/drafts", {
		message: { raw },
	});
	return { subject: input.subject, to: input.to, provider: "gmail-nango" };
}
