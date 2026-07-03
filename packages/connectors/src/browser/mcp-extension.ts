import { createConnection } from "@playwright/mcp";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

export interface ExtensionTab {
	index: number;
	url: string;
	title: string;
	current: boolean;
}

export interface ExtensionProbe {
	configured: boolean;
	connected: boolean;
	tabCount: number;
	tabs: ExtensionTab[];
	error?: string;
}

const BRIDGE_EXTENSION_PREFIX = "chrome-extension://mmlmfjhmonkocbjadbfplnigmagldckm";

let clientPromise: Promise<Client> | null = null;

export function getPlaywrightExtensionToken(): string | undefined {
	return process.env.PLAYWRIGHT_MCP_EXTENSION_TOKEN?.trim() || undefined;
}

function parseTabs(text: string): ExtensionTab[] {
	const tabs: ExtensionTab[] = [];
	for (const line of text.split("\n")) {
		const match = line.match(/^- (\d+):(?: \(current\))? \[([^\]]*)\]\(([^)]+)\)/);
		if (!match) continue;
		tabs.push({
			index: Number(match[1]),
			title: match[2] ?? "",
			url: match[3] ?? "",
			current: line.includes("(current)"),
		});
	}
	return tabs;
}

function pickUserTab(tabs: ExtensionTab[]): ExtensionTab | undefined {
	const real = tabs.filter((t) => !t.url.startsWith(BRIDGE_EXTENSION_PREFIX));
	return real.find((t) => t.current) ?? real[0];
}

async function getMcpClient(): Promise<Client> {
	if (!clientPromise) {
		clientPromise = (async () => {
			const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
			const server = await createConnection({ extension: true });
			const client = new Client({ name: "fold", version: "0.1" });
			await server.connect(serverTransport);
			await client.connect(clientTransport);
			return client;
		})().catch((err) => {
			clientPromise = null;
			throw err;
		});
	}
	return clientPromise;
}

async function callTabsList(): Promise<ExtensionTab[]> {
	const client = await getMcpClient();
	const res = (await client.callTool({
		name: "browser_tabs",
		arguments: { action: "list" },
	})) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
	const text = res.content?.find((c) => c.type === "text")?.text ?? "";
	if (res.isError) throw new Error(text.slice(0, 300));
	return parseTabs(text);
}

export async function probePlaywrightExtension(): Promise<ExtensionProbe> {
	if (!getPlaywrightExtensionToken()) {
		return { configured: false, connected: false, tabCount: 0, tabs: [] };
	}
	try {
		const tabs = await callTabsList();
		const userTabs = tabs.filter((t) => !t.url.startsWith(BRIDGE_EXTENSION_PREFIX));
		return {
			configured: true,
			connected: userTabs.length > 0,
			tabCount: userTabs.length,
			tabs: userTabs,
			error: userTabs.length === 0 ? "扩展已连接，但没有可操控的普通网页标签" : undefined,
		};
	} catch (err) {
		clientPromise = null;
		return {
			configured: true,
			connected: false,
			tabCount: 0,
			tabs: [],
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function getExtensionCurrentPage(): Promise<{
	url: string;
	title: string;
	pages: Array<{ url: string; title: string }>;
}> {
	const tabs = await callTabsList();
	const target = pickUserTab(tabs);
	if (!target) {
		throw new Error(
			"Playwright Bridge 已连接，但没有找到可读取的网页标签。请先在 Chrome 打开目标页面。",
		);
	}
	if (!target.current) {
		const client = await getMcpClient();
		await client.callTool({
			name: "browser_tabs",
			arguments: { action: "select", index: target.index },
		});
	}
	const userTabs = tabs
		.filter((t) => !t.url.startsWith(BRIDGE_EXTENSION_PREFIX))
		.map((t) => ({ url: t.url, title: t.title }));
	return { url: target.url, title: target.title, pages: userTabs };
}
