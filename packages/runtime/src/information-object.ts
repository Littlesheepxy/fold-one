import type { LiveContext } from "@fold/context";

export type InformationObjectKind = "webpage" | "document" | "file" | "app" | "unknown";

export interface InformationObject {
	/** 稳定键，用于指纹与相似检索 */
	id: string;
	kind: InformationObjectKind;
	title: string;
	app?: string;
	url?: string;
	host?: string;
}

function hostFromUrl(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return "";
	}
}

function slug(text: string): string {
	return text
		.toLowerCase()
		.replace(/\s+/g, "-")
		.replace(/[^a-z0-9\u4e00-\u9fff-]/g, "")
		.slice(0, 48);
}

function objectFromWeb(url: string, title: string, app?: string): InformationObject {
	const host = hostFromUrl(url);
	let pathKey = "";
	try {
		pathKey = new URL(url).pathname.split("/").filter(Boolean).slice(0, 2).join("/");
	} catch {
		// ignore
	}
	const id = `web:${host}/${pathKey || slug(title)}`;
	return {
		id,
		kind: "webpage",
		title: title || host || url,
		app,
		url,
		host,
	};
}

function objectFromFile(path: string): InformationObject {
	const name = path.split("/").pop() ?? path;
	const ext = name.split(".").pop()?.toLowerCase() ?? "";
	return {
		id: `file:${slug(name)}`,
		kind: ext === "pdf" || ext === "doc" || ext === "docx" ? "document" : "file",
		title: name,
	};
}

function objectFromApp(app: string, windowTitle?: string): InformationObject {
	const title = windowTitle?.trim() || app;
	return {
		id: `app:${slug(app)}:${slug(title)}`,
		kind: "app",
		title,
		app,
	};
}

export interface InformationObjectInput {
	chromeTabs?: Array<{ url: string; title: string; active?: boolean }>;
	/** OCR 或 AX 读到的前台文本 */
	screenText?: string;
	accessibilityText?: string;
	/** AX 读到的真实前台 App（比 2s 轮询的 ctx.activeApp 更准） */
	accessibilityApp?: string;
	accessibilityWindowTitle?: string;
	/** AX 文本来源：ax=辅助功能树，ocr=Apple Vision 图像识别兜底 */
	accessibilitySourceKind?: "ax" | "ocr";
	/** 任务时刻截图的本地路径 */
	screenshotPath?: string;
	entities?: string[];
	/** 未来若干小时内的日历事件（EventKit） */
	calendarEvents?: Array<{
		title: string;
		startAt: number;
		endAt: number;
		calendar?: string;
	}>;
}

const BROWSER_APP_RE = /chrome|arc|brave|edge|safari|firefox/i;

function isBrowserApp(app: string | null | undefined): boolean {
	return !!app && BROWSER_APP_RE.test(app);
}

function frontAppName(ctx: LiveContext, input: InformationObjectInput): string | null {
	return input.accessibilityApp?.trim() || ctx.activeApp?.trim() || null;
}

function frontWindowTitle(ctx: LiveContext, input: InformationObjectInput): string | undefined {
	return input.accessibilityWindowTitle?.trim() || ctx.activeWindow?.trim() || undefined;
}

/** 把切换流合并成「信息对象」列表（当前焦点 + 近期网页/文件）。 */
export function resolveInformationObjects(
	ctx: LiveContext,
	input: InformationObjectInput = {},
): InformationObject[] {
	const byId = new Map<string, InformationObject>();

	for (const tab of input.chromeTabs ?? []) {
		if (!tab.url?.startsWith("http")) continue;
		const obj = objectFromWeb(tab.url, tab.title, "Google Chrome");
		byId.set(obj.id, obj);
	}

	for (const u of ctx.recentUrls.slice(0, 10)) {
		if (!u.url?.startsWith("http")) continue;
		const obj = objectFromWeb(u.url, u.title, ctx.activeApp ?? undefined);
		byId.set(obj.id, obj);
	}

	for (const f of ctx.recentFiles.slice(0, 6)) {
		const obj = objectFromFile(f.path);
		byId.set(obj.id, obj);
	}

	if (ctx.activeApp) {
		const obj = objectFromApp(ctx.activeApp, ctx.activeWindow ?? undefined);
		byId.set(obj.id, obj);
	}

	// 截屏/OCR/AX 首行：若与当前窗口标题不一致，补锚点对象
	const mergedScreen = [input.screenText, input.accessibilityText].filter(Boolean).join("\n");
	const screenLine = mergedScreen
		.split(/\r?\n/)
		.map((l) => l.trim())
		.find((l) => l.length >= 4 && l.length <= 120);
	if (screenLine && ctx.activeWindow && !ctx.activeWindow.includes(screenLine.slice(0, 20))) {
		const obj: InformationObject = {
			id: `screen:${slug(screenLine)}`,
			kind: "unknown",
			title: screenLine,
			app: ctx.activeApp ?? undefined,
		};
		byId.set(obj.id, obj);
	}

	return [...byId.values()];
}

export function primaryInformationObject(
	objects: InformationObject[],
	ctx: LiveContext,
	input: InformationObjectInput = {},
): InformationObject | null {
	const frontApp = frontAppName(ctx, input);
	const winTitle = frontWindowTitle(ctx, input);

	// 仅当前台真的是浏览器时，才用 Chrome 活动标签作锚点（多屏时 Chrome 可能在另一屏）
	if (isBrowserApp(frontApp)) {
		const activeTab = input.chromeTabs?.find((t) => t.active);
		if (activeTab?.url?.startsWith("http")) {
			return objectFromWeb(activeTab.url, activeTab.title, frontApp ?? "Google Chrome");
		}
		if (frontApp) {
			return objectFromApp(frontApp, winTitle);
		}
	}

	if (frontApp) {
		return objectFromApp(frontApp, winTitle);
	}

	if (objects.length === 0) return null;

	const activeTab = input.chromeTabs?.find((t) => t.active);
	if (activeTab?.url?.startsWith("http")) {
		return objectFromWeb(activeTab.url, activeTab.title, "Google Chrome");
	}

	const recentWeb = objects.find((o) => o.kind === "webpage");
	if (recentWeb) return recentWeb;

	return objects[0] ?? null;
}

export function anchorFromObjects(
	objects: InformationObject[],
	ctx: LiveContext,
	input: InformationObjectInput = {},
): string | null {
	const primary = primaryInformationObject(objects, ctx, input);
	if (!primary) return null;
	if (primary.app && primary.kind === "webpage") {
		return `${primary.app} · ${primary.title}`;
	}
	if (primary.app) return `${primary.app} · ${primary.title}`;
	return primary.title;
}
