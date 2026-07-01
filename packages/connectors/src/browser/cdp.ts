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
}

export function getChromeCdpUrl(): string | undefined {
	return process.env.FOLD_CHROME_CDP_URL?.trim() || undefined;
}

async function getChromium() {
	const { chromium } = await import("playwright");
	return chromium;
}

export async function connectBrowser(): Promise<BrowserSession> {
	const cdpUrl = getChromeCdpUrl();
	const chromium = await getChromium();
	if (cdpUrl) {
		const browser = await chromium.connectOverCDP(cdpUrl);
		const context = browser.contexts()[0] ?? (await browser.newContext());
		return { browser, context, ownsBrowser: false };
	}
	const browser = await chromium.launch({
		headless: false,
		channel: "chrome",
	});
	const context = await browser.newContext();
	return { browser, context, ownsBrowser: true };
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
	BrowserPageInfo & { pages: BrowserPageInfo[]; cdpUrl?: string; connected: boolean }
> {
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
			cdpUrl: getChromeCdpUrl(),
			connected: true,
		};
	});
}

export async function probeBrowserCdp(): Promise<BrowserCdpProbe> {
	const cdpUrl = getChromeCdpUrl();
	if (!cdpUrl) {
		return { connected: false, pageCount: 0, mailUrl: null };
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
