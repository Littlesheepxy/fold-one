import type { MailCountUnreadResult, MailDraftInput, MailDraftResult, MailOpenResult } from "./types.js";
import { getOrOpenPage, withBrowserSession } from "../browser/cdp.js";

const GMAIL_INBOX_URL = "https://mail.google.com/mail/u/0/#inbox";

function resolveToEmail(input: MailDraftInput): string {
	if (input.toEmail) return input.toEmail;
	if (input.to.includes("@")) return input.to;
	return `${input.to}@example.com`;
}

/**
 * Gmail Web via Playwright + CDP.
 * Requires: logged-in Chrome profile or FOLD_CHROME_CDP_URL pointing at running Chrome.
 */
export async function createGmailWebDraft(input: MailDraftInput): Promise<MailDraftResult> {
	return withBrowserSession(async (session) => {
		const page = await getOrOpenPage(
			session,
			"https://mail.google.com/mail/u/0/#inbox",
			/mail\.google\.com/i,
		);
		if (!/mail\.google\.com/i.test(page.url())) {
			await page.goto("https://mail.google.com/mail/u/0/#inbox", {
				waitUntil: "domcontentloaded",
				timeout: 30_000,
			});
		}

		const compose = page
			.locator('[gh="cm"], [aria-label="Compose"], [aria-label="写邮件"]')
			.first();
		await compose.click({ timeout: 15_000 });

		const toField = page.locator('input[name="to"], textarea[name="to"]').first();
		await toField.waitFor({ timeout: 10_000 });
		await toField.fill(resolveToEmail(input));

		const subjectField = page.locator('input[name="subjectbox"]').first();
		await subjectField.fill(input.subject);

		const bodyField = page
			.locator('div[aria-label="Message Body"], div[aria-label="邮件正文"]')
			.first();
		await bodyField.click();
		await bodyField.fill(input.body);

		return {
			subject: input.subject,
			to: input.to,
			provider: "gmail-web",
		};
	});
}

export async function openGmailWeb(): Promise<MailOpenResult> {
	return withBrowserSession(async (session) => {
		const page = await getOrOpenPage(session, GMAIL_INBOX_URL, /mail\.google\.com/i);
		await page.bringToFront();
		return { provider: "gmail-web", opened: true };
	});
}

export async function countGmailWebUnread(): Promise<MailCountUnreadResult> {
	return withBrowserSession(async (session) => {
		const page = await getOrOpenPage(session, GMAIL_INBOX_URL, /mail\.google\.com/i);
		if (!/mail\.google\.com/i.test(page.url())) {
			await page.goto(GMAIL_INBOX_URL, { waitUntil: "domcontentloaded", timeout: 30_000 });
		}

		await page
			.waitForSelector('[role="navigation"], [gh="tl"], div[role="main"]', { timeout: 20_000 })
			.catch(() => {
				throw new Error("Gmail inbox did not load. Check Chrome CDP URL and login state.");
			});

		const count = await page.evaluate(() => {
			const w = globalThis as { document?: { querySelector: (s: string) => unknown; body: unknown; querySelectorAll: (s: string) => { length: number } } };
			const doc = w.document;
			if (!doc) return 0;

			const parseCount = (text: string): number | null => {
				const normalized = text.replace(/,/g, "");
				const match = normalized.match(/(\d+)\s*(unread|未读|封未读)/i);
				if (match?.[1]) return Number.parseInt(match[1], 10);
				const badge = normalized.match(/\b(\d{1,5})\b/);
				return badge?.[1] ? Number.parseInt(badge[1], 10) : null;
			};

			const nav = (doc.querySelector('[role="navigation"]') ?? doc.body) as {
				querySelector: (s: string) => {
					getAttribute: (n: string) => string | null;
					textContent: string | null;
				} | null;
			};
			const inboxLink =
				nav.querySelector('a[href*="#inbox"]') ??
				nav.querySelector('a[aria-label*="Inbox" i]') ??
				nav.querySelector('a[aria-label*="收件箱"]');
			if (inboxLink) {
				const label = inboxLink.getAttribute("aria-label") ?? inboxLink.textContent ?? "";
				const parsed = parseCount(label);
				if (parsed != null) return parsed;
			}

			const unreadRows = doc.querySelectorAll(
				'tr.zE, [role="row"][aria-label*="unread" i], [role="row"][aria-label*="未读"]',
			);
			return unreadRows.length;
		});

		if (!Number.isFinite(count)) {
			throw new Error("Gmail unread count parse failed");
		}

		return { provider: "gmail-web", count };
	});
}

/** Outlook Web — stub for future connector. */
export async function createOutlookWebDraft(_input: MailDraftInput): Promise<MailDraftResult> {
	throw new Error("outlook-web connector not implemented yet");
}
