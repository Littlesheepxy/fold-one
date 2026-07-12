import { generateText, streamText } from "ai";
import { hasPlannerApiKey, resolveModelChoice } from "./model-choice.js";
import { toLanguageModel } from "./providers.js";

export interface AhaGuessPage {
	title: string;
	url: string;
}

export interface AhaGuessAppStep {
	app: string;
	window?: string;
}

export interface AhaGuessInput {
	activeApp?: string | null;
	activeWindow?: string | null;
	anchor?: string | null;
	trail?: string[];
	recentPages?: AhaGuessPage[];
	appTrail?: AhaGuessAppStep[];
	chromeTabs?: AhaGuessPage[];
	contextSnippet?: string;
	contextBrief?: string;
	confidenceLevel?: "high" | "medium" | "low";
	confidenceScore?: number;
	topSuggestion?: {
		label: string;
		intent: string;
		reason: string;
	} | null;
}

export interface StreamAhaGuessOptions {
	allowCloud?: boolean;
	onCloudSuccess?: () => void;
	onChunk: (chunk: string) => void;
	isCancelled?: () => boolean;
}

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
		if (cleanedTitle.length <= 36) return cleanedTitle;
	}
	return host || url;
}

function uniqueLabels(pages: AhaGuessPage[], appTrail: AhaGuessAppStep[] = []): string[] {
	const out: string[] = [];
	for (const page of pages) {
		const label = friendlySiteLabel(page.url, page.title);
		if (!label || out.includes(label)) continue;
		out.push(label);
	}
	for (const step of appTrail) {
		const app = step.app.trim();
		if (!app || /electron|fold/i.test(app)) continue;
		let label = app;
		if (/typeless/i.test(app)) label = "Typeless";
		else if (/cursor/i.test(app)) label = "Cursor";
		else if (/chrome/i.test(app)) continue;
		if (!out.includes(label)) out.push(label);
	}
	return out;
}

function formatRecentPages(pages: AhaGuessPage[]): string {
	if (!pages.length) return "（暂无）";
	return pages
		.slice(0, 8)
		.map((page) => {
			const label = friendlySiteLabel(page.url, page.title);
			return `- ${label}${page.title && page.title !== label ? `（${page.title}）` : ""} · ${page.url}`;
		})
		.join("\n");
}

function formatAppTrail(steps: AhaGuessAppStep[]): string {
	if (!steps.length) return "（暂无）";
	return steps
		.slice(-8)
		.map((step) => (step.window ? `${step.app} · ${step.window}` : step.app))
		.join("\n→ ");
}

function looksLikeProductResearch(labels: string[], pages: AhaGuessPage[]): boolean {
	const blob = `${labels.join(" ")} ${pages.map((p) => `${p.title} ${p.url}`).join(" ")}`.toLowerCase();
	const productHits = ["typeless", "闪电说", "cursor", "wispr", "voice", "口述", "语音", "定价", "pricing"].filter(
		(k) => blob.includes(k.toLowerCase()) || labels.some((l) => l.toLowerCase().includes(k.toLowerCase())),
	);
	return productHits.length >= 2 || (labels.length >= 2 && pages.some((p) => /pricing|定价|price/i.test(p.url + p.title)));
}

export function ruleBasedAhaReply(input: AhaGuessInput): string {
	const level = input.confidenceLevel ?? "medium";
	const pages = input.recentPages ?? [];
	const labels = uniqueLabels(pages, input.appTrail ?? []);

	if (level === "low" && labels.length === 0 && pages.length === 0) {
		const app = input.activeApp?.trim();
		if (app && !/electron|fold/i.test(app)) {
			return `还不太确定你在做什么。你现在在用 ${app}，可以多切换几个应用或打开几个页面，我再帮你看。`;
		}
		return "还不太确定你在做什么。可以先正常使用一会儿，我再帮你看。";
	}

	const hedge = level === "high" ? "" : level === "medium" ? "我猜" : "还不太确定，不过";

	if (labels.length >= 2) {
		const list = labels.slice(0, 5).join("、");
		if (looksLikeProductResearch(labels, pages)) {
			return `${hedge ? `${hedge} ` : ""}你刚才连着看了 ${list} 等页面，像是在调研或对比语音输入 / AI 助手类产品。`.trim();
		}
		return `${hedge ? `${hedge} ` : ""}你刚才在浏览 ${list}，可能在做产品调研或整理思路。`.trim();
	}

	if (labels.length === 1) {
		const page = pages[0]!;
		if (/pricing|定价|price/i.test(`${page.url} ${page.title}`)) {
			return `${hedge ? `${hedge} ` : ""}你刚才打开了 ${labels[0]} 的定价页，可能是在看方案和价格。`.trim();
		}
		return `${hedge ? `${hedge} ` : ""}你刚才打开了 ${labels[0]}，可能还在看相关内容。`.trim();
	}

	const top = input.topSuggestion;
	if (top && level !== "low") {
		return top.reason
			? `我觉得你现在可能想${top.label}。${top.reason}`
			: `我觉得你现在可能想${top.label}：${top.intent}`;
	}

	const anchor = input.anchor?.trim();
	if (anchor && !/electron|fold/i.test(anchor)) {
		return `${hedge ? `${hedge} ` : ""}你现在在 ${anchor}。`.trim();
	}

	const app = input.activeApp?.trim();
	const window = input.activeWindow?.trim();
	if (app && window && !/electron|fold/i.test(`${app} ${window}`)) {
		return `${hedge ? `${hedge} ` : ""}你现在在用 ${app}，窗口是「${window}」。`.trim();
	}
	if (app && !/electron|fold/i.test(app)) {
		return `${hedge ? `${hedge} ` : ""}你现在在用 ${app}。`.trim();
	}

	return "我还没捕捉到你的浏览记录，切换几个应用或打开几个网页后再试试。";
}

function buildAhaGuessPrompt(input: AhaGuessInput): string {
	const pages = input.recentPages ?? [];
	const recentPagesText = formatRecentPages(pages);
	const appTrailText = formatAppTrail(input.appTrail ?? []);
	const chromeTabsText = formatRecentPages(input.chromeTabs ?? []);
	const context = input.contextSnippet?.trim().slice(0, 900) || "（无页面文本）";
	const workContext = input.contextBrief?.trim() || "（暂无工作现场）";
	const hint = input.topSuggestion
		? `参考推断：${input.topSuggestion.label} — ${input.topSuggestion.reason || input.topSuggestion.intent}`
		: "（暂无高把握推断）";
	const confidenceHint =
		input.confidenceLevel === "low"
			? "把握度：较低。必须用「还不太确定」「可能」「好像」等措辞，禁止具体断言用户在做某件你没在轨迹里看到的事。"
			: input.confidenceLevel === "medium"
				? "把握度：中等。语气可亲切，但避免过于肯定的判断，可用「可能」「好像」。"
				: "把握度：较高。可较自然地归纳用户正在做的事。";

	return `你是 Fold 桌面助手。根据用户最近的真实操作轨迹，用 1-2 句自然、亲切的中文猜用户现在在干嘛、可能想做什么。
要求：
- 直接输出中文正文，不要标题、不要列表、不要 JSON
- ${confidenceHint}
- 优先根据「工作现场」「最近浏览页面」和「应用切换」推断；若用户连续看了多个产品/网站，要点名说出来（如 Typeless、Cursor、闪电说）
- 若近期文件、剪贴板与当前窗口一致，可自然提及；仅后台打开、未访问过的标签不要当成正在做的事
- 把握度较低时禁止把后台标签、窗口摘要当成确定事实
- 可合理归纳意图（如调研语音输入产品、对比定价、整理竞品）
- 不要提 Fold / Electron 设置页当作用户工作本身

当前应用：${input.activeApp ?? "未知"}
当前窗口：${input.activeWindow ?? "未知"}
情境锚点：${input.anchor ?? "未知"}
最近应用切换：${input.trail?.slice(-6).join(" → ") || "（暂无）"}
${hint}

工作现场（轨迹、文件、剪贴板）：
${workContext}

最近浏览页面（最重要）：
${recentPagesText}

窗口/应用轨迹：
${appTrailText}

近期相关 Chrome 标签（仅访问过的站点）：
${chromeTabsText}

当前窗口摘要：
${context}`;
}

function applyConfidenceGate(reply: string, input: AhaGuessInput): string {
	const level = input.confidenceLevel ?? "medium";
	if (level === "high") return reply;
	if (/还不太确定|我猜|可能|好像|似乎/.test(reply)) return reply;
	if (level === "low") {
		return `还不太确定，不过${reply.replace(/^(你|我觉得)/, "你好像")}`;
	}
	return `我猜${reply.startsWith("你") ? "" : " "}${reply}`;
}

function finalizeAhaReply(raw: string, input: AhaGuessInput): string {
	const pages = input.recentPages ?? [];
	let reply = raw.trim().replace(/^["']|["']$/g, "");
	if (!reply) reply = ruleBasedAhaReply(input);
	if (/信息还不够|信息不太够|先陪你观察/.test(reply) && pages.length >= 2) {
		reply = ruleBasedAhaReply(input);
	}
	if (input.confidenceLevel === "low" && pages.length === 0 && !input.contextBrief?.includes("近期文件")) {
		return ruleBasedAhaReply(input);
	}
	return applyConfidenceGate(reply, input);
}

async function emitRuleBasedStream(
	text: string,
	onChunk: (chunk: string) => void,
	isCancelled?: () => boolean,
): Promise<void> {
	const parts = text.match(/[\s\S]{1,3}/g) ?? [text];
	for (const part of parts) {
		if (isCancelled?.()) return;
		onChunk(part);
		await Promise.resolve();
	}
}

export async function generateAhaGuess(
	input: AhaGuessInput,
	opts?: { allowCloud?: boolean; onCloudSuccess?: () => void },
): Promise<string> {
	if (opts?.allowCloud === false || !hasPlannerApiKey()) {
		return ruleBasedAhaReply(input);
	}

	try {
		const model = toLanguageModel(resolveModelChoice("planner"));
		const { text } = await generateText({ model, prompt: buildAhaGuessPrompt(input) });
		const reply = finalizeAhaReply(text, input);
		opts?.onCloudSuccess?.();
		return reply;
	} catch {
		return ruleBasedAhaReply(input);
	}
}

export async function streamAhaGuess(
	input: AhaGuessInput,
	opts: StreamAhaGuessOptions,
): Promise<string> {
	const pages = input.recentPages ?? [];
	if (opts.allowCloud === false || !hasPlannerApiKey()) {
		const text = ruleBasedAhaReply(input);
		await emitRuleBasedStream(text, opts.onChunk, opts.isCancelled);
		return text;
	}

	try {
		const model = toLanguageModel(resolveModelChoice("planner"));
		const { textStream } = streamText({ model, prompt: buildAhaGuessPrompt(input) });
		let full = "";
		for await (const chunk of textStream) {
			if (opts.isCancelled?.()) break;
			full += chunk;
			opts.onChunk(chunk);
		}
		if (opts.isCancelled?.()) return full;
		const reply = finalizeAhaReply(full, input);
		opts?.onCloudSuccess?.();
		return reply;
	} catch {
		const text = ruleBasedAhaReply(input);
		await emitRuleBasedStream(text, opts.onChunk, opts.isCancelled);
		return text;
	}
}
