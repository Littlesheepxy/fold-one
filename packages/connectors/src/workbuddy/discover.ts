import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

type McpServerEntry = {
	url?: string;
	headers?: Record<string, string>;
};

const TOKEN_IN_LINE = /Bearer\s+([A-Za-z0-9_-]{20,})/;

function readWorkBuddyMcpConfig(): Record<string, unknown> | null {
	const path = join(homedir(), ".workbuddy", ".mcp.json");
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
	} catch {
		return null;
	}
}

function connectorProxyEntry(config: Record<string, unknown>): McpServerEntry | null {
	const servers = config.mcpServers;
	if (!servers || typeof servers !== "object") return null;
	const entry = (servers as Record<string, McpServerEntry>)["connector-proxy"];
	return entry ?? null;
}

function extractBearerToken(text: string): string | null {
	const jsonMatch = text.match(/"Authorization"\s*:\s*"Bearer\s+([^"\\]+)"/);
	if (jsonMatch?.[1]?.trim()) return jsonMatch[1].trim();
	const plainMatch = text.match(TOKEN_IN_LINE);
	return plainMatch?.[1]?.trim() ?? null;
}

function listProcessLines(): string[] {
	try {
		return execSync("ps -ax -o command=", {
			encoding: "utf8",
			maxBuffer: 10 * 1024 * 1024,
		}).split("\n");
	} catch {
		return [];
	}
}

function discoverTokenFromGatewayListener(gatewayUrl: string): string | null {
	let port: string;
	try {
		port = new URL(gatewayUrl).port;
	} catch {
		return null;
	}
	if (!port) return null;
	try {
		const pids = execSync(`lsof -tiTCP:${port} -sTCP:LISTEN 2>/dev/null`, {
			encoding: "utf8",
		})
			.trim()
			.split("\n")
			.filter(Boolean);
		for (const pid of pids) {
			const env = execSync(`ps eww -p ${pid} 2>/dev/null`, {
				encoding: "utf8",
				maxBuffer: 4 * 1024 * 1024,
			});
			const password = env.match(/CODEBUDDY_GATEWAY_PASSWORD=([^\s]+)/)?.[1];
			if (password) return password;
			const bearer = extractBearerToken(env);
			if (bearer) return bearer;
		}
	} catch {
		// ignore
	}
	return null;
}

/** WorkBuddy 桌面版会把 connector-proxy 写到 ~/.workbuddy/.mcp.json */
export function discoverWorkBuddyGatewayUrl(): string | null {
	const config = readWorkBuddyMcpConfig();
	if (!config) return null;
	const entry = connectorProxyEntry(config);
	if (!entry?.url?.trim()) return null;
	try {
		const parsed = new URL(entry.url);
		return `${parsed.protocol}//${parsed.host}`;
	} catch {
		return null;
	}
}

export function discoverWorkBuddyMcpAuthHeader(): string | null {
	const config = readWorkBuddyMcpConfig();
	if (!config) return null;
	const auth = connectorProxyEntry(config)?.headers?.Authorization;
	return typeof auth === "string" && auth.trim() ? auth.trim() : null;
}

export function isWorkBuddyAppProcessRunning(): boolean {
	return listProcessLines().some((line) =>
		/WorkBuddy\.app|\/WorkBuddy|workbuddy/i.test(line),
	);
}

/**
 * WorkBuddy 5.x 把 Bearer token 注入 codebuddy 子进程的 --mcp-config。
 * 仅打开应用但尚未发起对话时，可能暂时没有 token。
 */
export function discoverWorkBuddyMcpTokenFromProcess(): string | null {
	const gatewayUrl = discoverWorkBuddyGatewayUrl();
	if (gatewayUrl) {
		const fromListener = discoverTokenFromGatewayListener(gatewayUrl);
		if (fromListener) return fromListener;
	}

	for (const line of listProcessLines()) {
		if (!/workbuddy|codebuddy|WorkBuddy|connector-proxy|mcp-config/i.test(line)) continue;
		const token = extractBearerToken(line);
		if (token) return token;
	}
	return null;
}

export function isManualWorkBuddyMcpToken(): boolean {
	return Boolean(process.env.FOLD_WORKBUDDY_MCP_TOKEN_MANUAL?.trim());
}

/** 每次调用都实时发现，避免 Fold 启动时缓存空 token。 */
export function resolveWorkBuddyGatewayUrl(): string | null {
	const manual = process.env.FOLD_WORKBUDDY_GATEWAY_URL_MANUAL?.trim();
	if (manual) return manual.replace(/\/$/, "");
	return discoverWorkBuddyGatewayUrl();
}
