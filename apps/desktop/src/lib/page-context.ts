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

export function friendlyBrowserName(appName: string | null | undefined): string {
	const name = appName?.trim() ?? "";
	if (/chrome/i.test(name)) return "Chrome";
	if (/arc/i.test(name)) return "Arc";
	if (/edge/i.test(name)) return "Edge";
	if (/brave/i.test(name)) return "Brave";
	if (/safari/i.test(name)) return "Safari";
	if (/firefox/i.test(name)) return "Firefox";
	return name || "浏览器";
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

export function voiceSurfaceLabel(input: {
	voiceMode?: "structure" | "reply" | "agent" | "interaction" | null;
	contextPageUrl?: string | null;
	contextPageLabel?: string | null;
	contextWindowTitle?: string | null;
}): string {
	if (input.contextPageUrl) {
		return (
			input.contextPageLabel ??
			formatBrowserPageLabel(input.contextWindowTitle, input.contextPageUrl)
		);
	}
	if (input.voiceMode === "reply") return "代回";
	if (input.voiceMode === "interaction") return "回答";
	return "转写";
}
