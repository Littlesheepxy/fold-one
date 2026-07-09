import type { Page } from "playwright";
import { findPage, getOrOpenPage, withBrowserSession } from "./cdp.js";
import type { ChromeTabInfo } from "./chrome-tabs.js";

export interface ChatPlatform {
	id: string;
	label: string;
	urlPattern: RegExp;
	homeUrl: string;
}

export interface ChatPlatformMatch {
	platform: ChatPlatform;
	tab?: ChromeTabInfo;
}

export const CHAT_PLATFORMS: ChatPlatform[] = [
	{
		id: "chatgpt",
		label: "ChatGPT",
		urlPattern: /chatgpt\.com|chat\.openai\.com/i,
		homeUrl: "https://chatgpt.com/",
	},
	{
		id: "claude",
		label: "Claude",
		urlPattern: /claude\.ai/i,
		homeUrl: "https://claude.ai/new",
	},
	{
		id: "doubao",
		label: "豆包",
		urlPattern: /doubao\.com/i,
		homeUrl: "https://www.doubao.com/chat/",
	},
	{
		id: "deepseek",
		label: "DeepSeek",
		urlPattern: /deepseek\.com/i,
		homeUrl: "https://chat.deepseek.com/",
	},
	{
		id: "tongyi",
		label: "通义千问",
		urlPattern: /tongyi\.aliyun\.com|qianwen\.com/i,
		homeUrl: "https://tongyi.aliyun.com/qianwen/",
	},
	{
		id: "kimi",
		label: "Kimi",
		urlPattern: /kimi\.moonshot\.cn|kimi\.com/i,
		homeUrl: "https://kimi.moonshot.cn/",
	},
];

export function detectChatPlatforms(tabs: ChromeTabInfo[]): ChatPlatformMatch[] {
	const matches: ChatPlatformMatch[] = [];
	for (const platform of CHAT_PLATFORMS) {
		const tab = tabs.find((t) => platform.urlPattern.test(t.url));
		matches.push({ platform, tab });
	}
	return matches;
}

export function getChatPlatform(id: string): ChatPlatform | undefined {
	return CHAT_PLATFORMS.find((p) => p.id === id);
}

interface PlatformRunner {
	fillPrompt(page: Page, text: string): Promise<void>;
	clickSend(page: Page): Promise<void>;
	assistantSelectors: string[];
}

const RUNNERS: Record<string, PlatformRunner> = {
	chatgpt: {
		async fillPrompt(page, text) {
			const input = page
				.locator('#prompt-textarea, textarea[data-id="root"], div[contenteditable="true"]')
				.first();
			await input.waitFor({ timeout: 15_000 });
			await input.click();
			await input.fill(text).catch(async () => {
				await page.evaluate(
					`(t) => {
						const el = document.querySelector('#prompt-textarea, textarea, div[contenteditable="true"]');
						if (!el) return;
						if (el.tagName === 'TEXTAREA') el.value = t;
						else el.textContent = t;
						el.dispatchEvent(new Event('input', { bubbles: true }));
					}`,
					text,
				);
			});
		},
		async clickSend(page) {
			const btn = page
				.locator(
					'button[data-testid="send-button"], button[aria-label*="Send"], button[aria-label*="发送"]',
				)
				.first();
			await btn.click({ timeout: 10_000 });
		},
		assistantSelectors: ['[data-message-author-role="assistant"]', '[data-testid*="conversation-turn"]'],
	},
	claude: {
		async fillPrompt(page, text) {
			const input = page.locator('[contenteditable="true"], .ProseMirror').first();
			await input.waitFor({ timeout: 15_000 });
			await input.click();
			await page.evaluate(
				`(t) => {
					const el = document.querySelector('[contenteditable="true"], .ProseMirror');
					if (!el) return;
					el.textContent = t;
					el.dispatchEvent(new Event('input', { bubbles: true }));
				}`,
				text,
			);
		},
		async clickSend(page) {
			const btn = page
				.locator(
					'button[aria-label*="Send"], button[aria-label*="发送"], button:has(svg)',
				)
				.filter({ hasNot: page.locator("[disabled]") })
				.last();
			await btn.click({ timeout: 10_000 });
		},
		assistantSelectors: [
			'[data-is-streaming="false"]',
			'[data-testid="user-message"] ~ div',
			'.font-claude-message',
		],
	},
};

async function waitForStableReply(page: Page, selectors: string[], timeoutMs = 120_000): Promise<string> {
	const start = Date.now();
	let last = "";
	let stable = 0;
	while (Date.now() - start < timeoutMs) {
		const text = String(
			await page.evaluate(
				`(sels) => {
				for (const sel of sels) {
					const nodes = document.querySelectorAll(sel);
					for (let i = nodes.length - 1; i >= 0; i--) {
						const t = nodes[i] && nodes[i].textContent ? nodes[i].textContent.trim() : '';
						if (t && t.length > 20) return t;
					}
				}
				const articles = document.querySelectorAll('article, [role="article"]');
				const lastArticle = articles[articles.length - 1];
				return lastArticle && lastArticle.textContent ? lastArticle.textContent.trim() : '';
			}`,
			selectors,
			),
		);

		if (text && text === last) stable += 1;
		else {
			stable = 0;
			last = text;
		}
		if (stable >= 3 && last.length > 40) return last;
		await page.waitForTimeout(1500);
	}
	if (last.length > 20) return last;
	throw new Error("等待 AI 回复超时，请手动复制回复后粘贴保存");
}

export interface ChatProfileImportResult {
	ok: boolean;
	response?: string;
	error?: string;
	targetUrl?: string;
}

/**
 * 在用户 Chrome（CDP）里打开聊天页 → 填入 prompt → 发送 → 等待回复。
 * 目前自动化适配 ChatGPT / Claude；其他平台返回明确错误。
 */
export async function runChatProfileImport(
	platformId: string,
	prompt: string,
	tabUrl?: string,
): Promise<ChatProfileImportResult> {
	const platform = getChatPlatform(platformId);
	if (!platform) return { ok: false, error: `未知平台: ${platformId}` };

	const runner = RUNNERS[platformId];
	if (!runner) {
		return {
			ok: false,
			error: `${platform.label} 暂不支持全自动导入，请复制 prompt 手动粘贴后回填`,
		};
	}

	const targetUrl = tabUrl && platform.urlPattern.test(tabUrl) ? tabUrl : platform.homeUrl;

	try {
		const response = await withBrowserSession(async (session) => {
			let page = findPage(session.context, platform.urlPattern);
			if (!page || (tabUrl && page.url() !== tabUrl)) {
				page = await getOrOpenPage(session, targetUrl, platform.urlPattern);
			}
			await page.bringToFront();
			await page.waitForTimeout(800);
			await runner.fillPrompt(page, prompt);
			await page.waitForTimeout(300);
			await runner.clickSend(page);
			return waitForStableReply(page, runner.assistantSelectors);
		});
		return { ok: true, response, targetUrl };
	} catch (err) {
		return { ok: false, error: (err as Error).message, targetUrl };
	}
}
