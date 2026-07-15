import type { LiveContext } from "@fold/context";
import type { FoldStateEvent } from "@fold/runtime";

function isBrowserApp(appName: string | null | undefined): boolean {
	return /chrome|arc|edge|brave|safari|firefox/i.test(appName ?? "");
}

function hostFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

export function formatBrowserPageLabel(title: string | null | undefined, url: string): string {
	const host = hostFromUrl(url);
	const cleaned = title?.replace(/\s*[-·|]\s*Google Chrome$/i, "").trim();
	if (cleaned && !/^google chrome$/i.test(cleaned)) {
		return cleaned.length <= 28 ? cleaned : `${cleaned.slice(0, 27)}…`;
	}
	return host || "网页";
}

export function faviconUrlForPage(url: string): string | null {
	try {
		const host = new URL(url).hostname;
		if (!host) return null;
		return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
	} catch {
		return null;
	}
}

export function resolveActiveBrowserPage(
	ctx: LiveContext,
): { url: string; title: string } | null {
	if (!isBrowserApp(ctx.activeApp)) return null;
	const url = ctx.activeUrl ?? ctx.recentUrls.find((u) => u.url.startsWith("http"))?.url ?? null;
	if (!url?.startsWith("http")) return null;
	const title =
		ctx.activeWindow && !/^google chrome$/i.test(ctx.activeWindow)
			? ctx.activeWindow
			: ctx.recentUrls.find((u) => u.url === url)?.title ?? hostFromUrl(url);
	return { url, title };
}

export function buildVoiceOverlayContext(ctx: LiveContext): Pick<
	FoldStateEvent,
	"contextAppName" | "contextAppPath" | "contextWindowTitle" | "contextPageUrl" | "contextPageLabel"
> {
	const page = resolveActiveBrowserPage(ctx);
	return {
		contextAppName: ctx.activeApp,
		contextAppPath: ctx.activeAppPath,
		contextWindowTitle: page ? page.title : ctx.activeWindow,
		contextPageUrl: page?.url ?? null,
		contextPageLabel: page ? formatBrowserPageLabel(page.title, page.url) : null,
	};
}
