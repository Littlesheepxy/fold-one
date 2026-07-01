import { findPage, getOrOpenPage, withBrowserSession } from "./cdp.js";

export type BrowserInteractAction = "goto" | "click" | "fill";

export interface BrowserInteractInput {
	action: BrowserInteractAction;
	url?: string;
	selector?: string;
	value?: string;
}

export interface BrowserInteractResult {
	ok: boolean;
	action: BrowserInteractAction;
	url: string;
	title: string;
	selector?: string;
	value?: string;
}

export async function browserInteract(input: BrowserInteractInput): Promise<BrowserInteractResult> {
	return withBrowserSession(async (session) => {
		let page = input.url
			? await getOrOpenPage(session, input.url)
			: findPage(session.context);

		if (!page) {
			if (!input.url) throw new Error("browser.interact: no active browser page");
			page = await getOrOpenPage(session, input.url);
		}

		if (input.action === "goto") {
			if (!input.url) throw new Error("browser.interact: goto requires url");
			await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 30_000 });
		}

		if (input.action === "click") {
			if (!input.selector) throw new Error("browser.interact: click requires selector");
			await page.locator(input.selector).first().click({ timeout: 15_000 });
		}

		if (input.action === "fill") {
			if (!input.selector) throw new Error("browser.interact: fill requires selector");
			if (input.value == null) throw new Error("browser.interact: fill requires value");
			await page.locator(input.selector).first().fill(input.value, { timeout: 15_000 });
		}

		return {
			ok: true,
			action: input.action,
			url: page.url(),
			title: await page.title(),
			selector: input.selector,
			value: input.value,
		};
	});
}
