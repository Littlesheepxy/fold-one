import { getExtensionCurrentPage, getPlaywrightExtensionToken, probePlaywrightExtension } from "./mcp-extension.js";
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import type { Browser, BrowserContext, Page } from "playwright";

export interface BrowserPageInfo {
	url: string;
	title: string;
	selectedText?: string;
}

export interface BrowserSession {
	browser: Browser;
	context: BrowserContext;
	ownsBrowser: boolean;
}

export interface BrowserCdpProbe {
	connected: boolean;
	cdpUrl?: string;
	pageCount: number;
	mailUrl?: string | null;
	error?: string;
	/** extension = Playwright MCP Bridge；cdp = Chrome remote debugging */
	mode?: "extension" | "cdp";
}

export function getChromeCdpUrl(): string | undefined {
	return process.env.FOLD_CHROME_CDP_URL?.trim() || undefined;
}

/**
 * 用户在 chrome://inspect/#remote-debugging 打开「Allow remote debugging」后，
 * Chrome 会在默认用户目录写 DevToolsActivePort（第一行端口，第二行 ws 路径）。
 * 这种模式只开 WebSocket 端点（HTTP /json/* 是 404），所以必须拼完整 ws URL。
 * 连上即是用户真实 Chrome（含登录态），无需插件。
 */
export async function getAutoDebugCdpUrl(): Promise<string | undefined> {
	let port: string | undefined;
	let wsPath: string | undefined;
	try {
		const file = join(
			homedir(),
			"Library/Application Support/Google/Chrome/DevToolsActivePort",
		);
		[port, wsPath] = readFileSync(file, "utf8").trim().split("\n");
	} catch {
		return undefined; // 文件不存在 = 开关未开
	}
	if (!port || !/^\d+$/.test(port) || !wsPath?.startsWith("/")) return undefined;
	try {
		// 端点只回 404，但只要有 HTTP 响应就说明端口活着；连不上才是真死（文件残留）
		await fetch(`http://127.0.0.1:${port}/json/version`, {
			signal: AbortSignal.timeout(1500),
		});
	} catch {
		return undefined;
	}
	return `ws://127.0.0.1:${port}${wsPath}`;
}

export async function resolveCdpUrl(): Promise<string | undefined> {
	return getChromeCdpUrl() ?? (await getAutoDebugCdpUrl());
}

async function getChromium() {
	const { chromium } = await import("playwright");
	return chromium;
}

export async function connectBrowser(): Promise<BrowserSession> {
	const cdpUrl = await resolveCdpUrl();
	if (!cdpUrl) {
		throw new Error(
			"未连接到你的 Chrome。请在设置填入 Playwright Bridge Token 并安装扩展，或在 Chrome 开启 remote debugging。",
		);
	}
	const chromium = await getChromium();
	const browser = await chromium.connectOverCDP(cdpUrl);
	const context = browser.contexts()[0] ?? (await browser.newContext());
	return { browser, context, ownsBrowser: false };
}

export async function withBrowserSession<T>(
	fn: (session: BrowserSession) => Promise<T>,
): Promise<T> {
	const session = await connectBrowser();
	try {
		return await fn(session);
	} finally {
		if (session.ownsBrowser) await session.browser.close();
	}
}

export function findPage(context: BrowserContext, urlPattern?: RegExp): Page | undefined {
	const pages = context.pages();
	if (urlPattern) {
		return pages.find((page) => urlPattern.test(page.url()));
	}
	return pages.find((page) => page.url() && page.url() !== "about:blank") ?? pages[0];
}

export async function getOrOpenPage(
	session: BrowserSession,
	url: string,
	urlPattern?: RegExp,
): Promise<Page> {
	const existing = findPage(session.context, urlPattern);
	if (existing) return existing;
	const page = await session.context.newPage();
	await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
	return page;
}

export async function readCurrentPageInfo(page: Page): Promise<BrowserPageInfo> {
	const title = await page.title();
	const selectedText = await page
		.evaluate<string | undefined>(
			`(() => {
				const selection = window.getSelection?.();
				return selection?.toString().trim() || undefined;
			})()`,
		)
		.catch(() => undefined);
	return { url: page.url(), title, selectedText };
}

export async function getCurrentBrowserPage(): Promise<
	BrowserPageInfo & { pages: BrowserPageInfo[]; cdpUrl?: string; connected: boolean; mode?: "extension" | "cdp" }
> {
	if (getPlaywrightExtensionToken()) {
		const ext = await probePlaywrightExtension();
		if (ext.connected) {
			const page = await getExtensionCurrentPage();
			return {
				url: page.url,
				title: page.title,
				pages: page.pages,
				connected: true,
				mode: "extension",
			};
		}
		throw new Error(
			ext.error ??
				"Playwright Bridge 未就绪。请确认扩展已安装，并在 Chrome 打开要操作的网页标签。",
		);
	}

	return withBrowserSession(async (session) => {
		const pageInfos: BrowserPageInfo[] = [];
		for (const page of session.context.pages()) {
			try {
				pageInfos.push(await readCurrentPageInfo(page));
			} catch {
				// detached page
			}
		}
		const active = findPage(session.context);
		const current = active ? await readCurrentPageInfo(active) : { url: "", title: "" };
		return {
			...current,
			pages: pageInfos,
			cdpUrl: await resolveCdpUrl(),
			connected: true,
			mode: "cdp",
		};
	});
}

export async function probeBrowserCdp(): Promise<BrowserCdpProbe> {
	if (getPlaywrightExtensionToken()) {
		const ext = await probePlaywrightExtension();
		if (ext.connected) {
			return {
				connected: true,
				pageCount: ext.tabCount,
				mailUrl: ext.tabs.find((t) => /mail\.google\.com|outlook\./i.test(t.url))?.url ?? null,
				mode: "extension",
			};
		}
		if (ext.configured) {
			return {
				connected: false,
				pageCount: 0,
				mailUrl: null,
				mode: "extension",
				error: ext.error ?? "Playwright Bridge 未连接。请确认扩展已安装且 Chrome 已打开目标网页",
			};
		}
	}

	const cdpUrl = await resolveCdpUrl();
	if (!cdpUrl) {
		return {
			connected: false,
			pageCount: 0,
			mailUrl: null,
			error: "未检测到调试通道。在 Chrome 打开 chrome://inspect/#remote-debugging 勾选 Allow remote debugging 并重启浏览器",
		};
	}
	try {
		return await withBrowserSession(async (session) => {
			const pages = session.context.pages();
			const mailPage = pages.find((page) => /mail\.google\.com|outlook\./i.test(page.url()));
			return {
				connected: true,
				cdpUrl,
				pageCount: pages.length,
				mailUrl: mailPage?.url() ?? null,
				mode: "cdp",
			};
		});
	} catch (error) {
		return {
			connected: false,
			cdpUrl,
			pageCount: 0,
			mailUrl: null,
			error: (error as Error).message,
		};
	}
}
