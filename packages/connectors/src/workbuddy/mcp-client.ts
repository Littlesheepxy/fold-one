import { randomUUID } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export function workBuddySessionId(): string {
	return process.env.WORK_BUDDY_SESSION_ID?.trim() || `fold-${randomUUID().slice(0, 8)}`;
}

export function workBuddyMcpUrl(gatewayUrl: string): URL {
	const base = gatewayUrl.replace(/\/$/, "");
	return new URL(`${base}/mcp/`);
}

export async function withWorkBuddyMcp<T>(
	gatewayUrl: string,
	fn: (client: Client, sessionId: string) => Promise<T>,
): Promise<T> {
	const sessionId = workBuddySessionId();
	const transport = new StreamableHTTPClientTransport(workBuddyMcpUrl(gatewayUrl), {
		requestInit: {
			headers: { "X-Work-Buddy-Session": sessionId },
		},
	});
	const client = new Client({ name: "fold", version: "0.0.1" });
	await client.connect(transport);
	try {
		await client.callTool({ name: "wb_init", arguments: { session_id: sessionId } });
		return await fn(client, sessionId);
	} finally {
		await client.close();
	}
}

export function parseMcpToolPayload(result: {
	content?: Array<{ type: string; text?: string }>;
	isError?: boolean;
}): unknown {
	const text = result.content?.find((item) => item.type === "text")?.text;
	if (!text) return result;
	try {
		return JSON.parse(text) as unknown;
	} catch {
		return text;
	}
}

export function summarizeMcpPayload(payload: unknown): string {
	if (payload == null) return "";
	if (typeof payload === "string") return payload.slice(0, 4000);
	try {
		return JSON.stringify(payload, null, 2).slice(0, 4000);
	} catch {
		return String(payload).slice(0, 4000);
	}
}

export function pickFirstCapability(payload: unknown): string | null {
	if (Array.isArray(payload)) {
		for (const item of payload) {
			const name = extractCapabilityName(item);
			if (name) return name;
		}
		return null;
	}
	if (payload && typeof payload === "object") {
		const results = (payload as { results?: unknown[] }).results;
		if (Array.isArray(results)) {
			for (const item of results) {
				const name = extractCapabilityName(item);
				if (name) return name;
			}
		}
	}
	return null;
}

function extractCapabilityName(item: unknown): string | null {
	if (!item || typeof item !== "object") return null;
	const record = item as Record<string, unknown>;
	const name = record.name ?? record.capability ?? record.id;
	return typeof name === "string" && name.trim() ? name.trim() : null;
}

export function isWorkflowPayload(payload: unknown): payload is { workflow_run_id: string } {
	return Boolean(
		payload &&
			typeof payload === "object" &&
			typeof (payload as { workflow_run_id?: unknown }).workflow_run_id === "string",
	);
}

export function payloadHasError(payload: unknown): boolean {
	return Boolean(payload && typeof payload === "object" && "error" in (payload as object));
}
