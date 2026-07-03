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

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
	return Promise.race([
		promise,
		new Promise<never>((_, reject) => {
			const timer = setTimeout(() => reject(new Error(message)), ms);
			timer.unref?.();
		}),
	]);
}

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
		// 扩展未连接时 MCP 连接会无限等待，必须限时，否则拖死整个 probe 阶段
		const tabs = await withTimeout(
			callTabsList(),
			8000,
			"Playwright Bridge 连接超时：扩展未安装或未连接。请检查扩展状态，或打开一个普通网页标签",
		);
		const userTabs = tabs.filter((t) => !t.url.startsWith(BRIDGE_EXTENSION_PREFIX));
		// 中继可用即视为已连接：共享标签页可以随时 navigate 到目标页，不依赖已有标签
		return {
			configured: true,
			connected: true,
			tabCount: userTabs.length,
			tabs: userTabs,
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

/** 解析 MCP 工具回包里 "### Result" 段的值（Playwright 用 JSON.stringify 打印返回值）。 */
function parseToolResult(text: string): unknown {
	const m = text.match(/### Result\n([\s\S]*?)(?:\n### |$)/);
	if (!m) return undefined;
	const raw = m[1]!.trim();
	try {
		return JSON.parse(raw);
	} catch {
		return raw;
	}
}

async function callExtensionTool(
	name: string,
	args: Record<string, unknown>,
	timeoutMs = 30_000,
): Promise<string> {
	const client = await getMcpClient();
	const res = (await withTimeout(
		client.callTool({ name, arguments: args }),
		timeoutMs,
		`Playwright Bridge 调用 ${name} 超时`,
	)) as { isError?: boolean; content?: Array<{ type: string; text?: string }> };
	const text = res.content?.find((c) => c.type === "text")?.text ?? "";
	if (res.isError) throw new Error(text.slice(0, 500));
	return text;
}

/** 在用户 Chrome 的共享标签页里执行 JS（复用登录态）。code 必须是函数表达式，如 "() => document.title"。 */
export async function extensionEvaluate(code: string, url?: string): Promise<unknown> {
	if (url) {
		await callExtensionTool("browser_navigate", { url }, 45_000);
	} else {
		// 无 url 时切到用户当前标签页，避免落在扩展欢迎页上
		const tabs = await callTabsList();
		const target = pickUserTab(tabs);
		if (target && !target.current) {
			await callExtensionTool("browser_tabs", { action: "select", index: target.index });
		}
	}
	const text = await callExtensionTool("browser_evaluate", { function: code }, 45_000);
	return parseToolResult(text);
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
