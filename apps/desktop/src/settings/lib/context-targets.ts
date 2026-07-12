import type { HomeContextEvent } from "../types.js";
import { friendlyBrowserName, formatBrowserPageLabel } from "../../lib/page-context.js";

export type ContextTarget =
	| {
			id: string;
			kind: "app";
			appName: string;
			appPath?: string | null;
			subtitle?: string | null;
	  }
	| {
			id: string;
			kind: "url";
			url: string;
			label: string;
			subtitle?: string | null;
			browserName?: string | null;
	  };

const MAX_TARGETS = 6;

function hostFromUrl(url: string): string {
	const match = url.match(/^https?:\/\/([^/?#]+)/i);
	return match?.[1]?.replace(/^www\./, "") ?? "";
}

function friendlySiteLabel(url: string, title?: string): string {
	const host = hostFromUrl(url).toLowerCase();
	if (host.includes("shandianshuo")) return "闪电说";
	if (host.includes("typeless")) return "Typeless";
	if (host.includes("cursor")) return "Cursor";
	if (host.includes("chatgpt") || host.includes("openai")) return "ChatGPT";
	if (host.includes("notion")) return "Notion";
	if (host.includes("github")) return "GitHub";

	const cleanedTitle = title?.replace(/\s*[-·|]\s*Google Chrome$/i, "").trim();
	if (cleanedTitle) {
		if (/闪电说/.test(cleanedTitle)) return "闪电说";
		if (/typeless/i.test(cleanedTitle)) return "Typeless";
		if (/cursor/i.test(cleanedTitle)) return "Cursor";
		if (cleanedTitle.length <= 28) return cleanedTitle;
	}
	return host || formatBrowserPageLabel(title, url);
}

function isSelfApp(name: string | null | undefined): boolean {
	return !name || /electron|fold|知更|zhigeng/i.test(name);
}

function isBrowserApp(name: string): boolean {
	return /chrome|arc|edge|brave|safari|firefox/i.test(name);
}

function normalizeAppKey(name: string): string {
	if (/微信|wechat/i.test(name)) return "wechat";
	return name.toLowerCase();
}

export function buildContextTargets(input: {
	activeApp?: string | null;
	activeWindow?: string | null;
	activeAppPath?: string | null;
	recentUrls?: Array<{ url: string; title: string }>;
	events?: HomeContextEvent[];
}): ContextTarget[] {
	const out: ContextTarget[] = [];
	const seenApps = new Set<string>();
	const seenUrlLabels = new Set<string>();
	let hasUrlTarget = false;

	const pushApp = (appName: string, appPath?: string | null, subtitle?: string | null) => {
		if (isSelfApp(appName) || isBrowserApp(appName)) return;
		const key = normalizeAppKey(appName);
		if (seenApps.has(key)) return;
		seenApps.add(key);
		out.push({
			id: `app:${appName}`,
			kind: "app",
			appName,
			appPath,
			subtitle,
		});
	};

	const pushUrl = (url: string, title?: string, browserName?: string | null) => {
		const label = friendlySiteLabel(url, title);
		const key = label.toLowerCase();
		if (!label || seenUrlLabels.has(key)) return;
		seenUrlLabels.add(key);
		hasUrlTarget = true;
		out.push({
			id: `url:${url}`,
			kind: "url",
			url,
			label,
			subtitle: friendlyBrowserName(browserName),
			browserName,
		});
	};

	const urlSources: Array<{ url: string; title: string; browserName?: string | null }> = [];
	for (const page of input.recentUrls ?? []) {
		urlSources.push({ url: page.url, title: page.title || page.url });
	}
	for (const event of input.events ?? []) {
		if (event.type === "browser.urlChanged" && event.data.url) {
			urlSources.push({
				url: event.data.url,
				title: event.data.windowTitle || event.data.url,
				browserName: event.data.appName,
			});
		}
	}

	const activeApp = input.activeApp?.trim();
	if (activeApp && !isBrowserApp(activeApp)) {
		pushApp(activeApp, input.activeAppPath, input.activeWindow);
	}

	for (const page of urlSources) {
		pushUrl(page.url, page.title, page.browserName);
		if (out.length >= MAX_TARGETS) return out;
	}

	const trailApps: Array<{ appName: string; appPath?: string; subtitle?: string }> = [];
	for (const event of input.events ?? []) {
		if (event.type !== "app.active" || !event.data.appName) continue;
		const appName = event.data.appName;
		if (isSelfApp(appName) || isBrowserApp(appName)) continue;
		trailApps.push({
			appName,
			appPath: event.data.appPath,
			subtitle: event.data.windowTitle,
		});
	}

	for (const step of trailApps.reverse()) {
		pushApp(step.appName, step.appPath, step.subtitle);
		if (out.length >= MAX_TARGETS) return out;
	}

	if (activeApp && isBrowserApp(activeApp) && !hasUrlTarget) {
		const key = normalizeAppKey(activeApp);
		if (!seenApps.has(key)) {
			seenApps.add(key);
			out.push({
				id: `app:${activeApp}`,
				kind: "app",
				appName: activeApp,
				appPath: input.activeAppPath,
				subtitle: input.activeWindow,
			});
		}
	}

	return out.slice(0, MAX_TARGETS);
}
