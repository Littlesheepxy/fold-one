import type { MailCountUnreadResult, MailDraftInput, MailDraftResult } from "../mail/types.js";

/**
 * Nango 托管连接器（https://nango.dev）。
 * Fold 通过 Nango 的 REST API 完成三件事：
 * 1. Connect Link — 生成托管授权页 URL，用户在浏览器里完成 OAuth
 * 2. 列出已授权连接（probe）
 * 3. Proxy — 用托管的 token 直接调第三方 API（如 Gmail）
 */

const DEFAULT_HOST = "https://api.nango.dev";
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
	error?: string;
}

function getNangoSecretKey(): string | undefined {
	return process.env.FOLD_NANGO_SECRET_KEY?.trim() || undefined;
}

function getNangoHost(): string {
	return process.env.FOLD_NANGO_HOST?.trim() || DEFAULT_HOST;
}

export function isNangoConfigured(): boolean {
	return Boolean(getNangoSecretKey());
}

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

export async function listNangoConnections(): Promise<NangoConnection[]> {
	const res = await nangoFetch("/connection");
	if (!res.ok) {
		throw new Error(`Nango 连接列表请求失败 (${res.status}): ${(await res.text()).slice(0, 200)}`);
	}
	const payload = (await res.json()) as {
		connections?: Array<{ connection_id: string; provider_config_key: string }>;
	};
	return (payload.connections ?? []).map((c) => ({
		connectionId: c.connection_id,
		providerConfigKey: c.provider_config_key,
	}));
}

export async function probeNango(): Promise<NangoProbe> {
	if (!isNangoConfigured()) {
		return {
			configured: false,
			connected: false,
			connections: [],
			error: "未配置 Nango Secret Key",
		};
	}
	try {
		const connections = await listNangoConnections();
		return { configured: true, connected: connections.length > 0, connections };
	} catch (err) {
		return {
			configured: true,
			connected: false,
			connections: [],
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

/** 生成 Nango 托管授权页链接，在浏览器里打开即可完成 OAuth。 */
export async function createNangoConnectLink(allowedIntegrations?: string[]): Promise<string> {
	const res = await nangoFetch("/connect/sessions", {
		method: "POST",
		body: JSON.stringify({
			tags: { end_user_id: "fold-local-user" },
			...(allowedIntegrations?.length ? { allowed_integrations: allowedIntegrations } : {}),
		}),
	});
	if (!res.ok) {
		throw new Error(`Nango 授权会话创建失败 (${res.status}): ${(await res.text()).slice(0, 200)}`);
	}
	const payload = (await res.json()) as { data?: { connect_link?: string } };
	if (!payload.data?.connect_link) {
		throw new Error("Nango 返回中缺少 connect_link");
	}
	return payload.data.connect_link;
}

async function getGmailConnection(): Promise<NangoConnection> {
	const connections = await listNangoConnections();
	const gmail = connections.find((c) => c.providerConfigKey === GMAIL_INTEGRATION_ID);
	if (!gmail) {
		throw new Error(`Nango 里没有 ${GMAIL_INTEGRATION_ID} 连接。先在连接页点「授权新应用」完成 Gmail 授权`);
	}
	return gmail;
}

export async function hasNangoGmailConnection(): Promise<boolean> {
	if (!isNangoConfigured()) return false;
	try {
		await getGmailConnection();
		return true;
	} catch {
		return false;
	}
}

async function nangoProxyFetch(
	connection: NangoConnection,
	path: string,
	init: RequestInit = {},
): Promise<Response> {
	return nangoFetch(`/proxy${path}`, {
		...init,
		headers: {
			"Provider-Config-Key": connection.providerConfigKey,
			"Connection-Id": connection.connectionId,
			...init.headers,
		},
	});
}

/** 收件箱未读数 — Gmail labels.get(INBOX) 的 messagesUnread 是精确值。 */
export async function countGmailUnreadViaNango(): Promise<MailCountUnreadResult> {
	const connection = await getGmailConnection();
	const res = await nangoProxyFetch(connection, "/gmail/v1/users/me/labels/INBOX");
	if (!res.ok) {
		throw new Error(`Nango Gmail 请求失败 (${res.status}): ${(await res.text()).slice(0, 200)}`);
	}
	const payload = (await res.json()) as { messagesUnread?: number };
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
	const connection = await getGmailConnection();
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
	const res = await nangoProxyFetch(connection, "/gmail/v1/users/me/drafts", {
		method: "POST",
		body: JSON.stringify({ message: { raw } }),
	});
	if (!res.ok) {
		throw new Error(`Nango Gmail 草稿创建失败 (${res.status}): ${(await res.text()).slice(0, 200)}`);
	}
	return { subject: input.subject, to: input.to, provider: "gmail-nango" };
}
