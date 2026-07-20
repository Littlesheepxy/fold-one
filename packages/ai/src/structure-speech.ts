import { hasFastModelApiKey } from "./model-choice.js";
import { generateFastText } from "./fast-text.js";

export interface StructuredSpeech {
	headline: string;
	detail: string;
}

export interface SpeechFormatContext {
	app?: string | null;
	windowTitle?: string | null;
	profileKeywords?: string[];
	allowCloud?: boolean;
	/** 引导/演示：跳过本地快路径，优先走模型（改口、渠道语气） */
	preferQuality?: boolean;
	/** 转写整理程度：minimal=仅去语气词，smart=智能整理（默认），off=原文直出 */
	cleanupLevel?: "minimal" | "smart" | "off";
	onCloudSuccess?: () => void;
}

function isChatContext(context: SpeechFormatContext): boolean {
	return /微信|wechat|飞书|lark|钉钉|dingtalk|slack|telegram|消息|chat/i.test(
		[context.app, context.windowTitle].filter(Boolean).join(" "),
	);
}

function isFormalContext(context: SpeechFormatContext): boolean {
	return /mail|gmail|outlook|邮件|邮箱|文档|知识库|docs|notion|飞书文档/i.test(
		[context.app, context.windowTitle].filter(Boolean).join(" "),
	);
}

function cleanSpeechText(transcript: string): string {
	let text = transcript
		.trim()
		.replace(/[，,]\s*/g, "，")
		.replace(/\s+/g, "")
		.replace(/^(嗯|呃|额|那个|就是|然后|诶|哎)[，,。.\s]*/g, "")
		.replace(/[，,。.\s]*(嗯|呃|额|那个|就是|然后|诶|哎)$/g, "")
		.replace(/(，)?(嗯|呃|额|那个|就是|然后)(，)?/g, "，")
		.replace(/，{2,}/g, "，")
		.replace(/^，|，$/g, "")
		.trim();

	// 改口：最后一次「不对」后的内容就是最终意思；不强求用户再说“改成/还是”
	const revisions = [...text.matchAll(/(?:啊|哦)?不对[，,。.\s]*/g)];
	const lastRevision = revisions.at(-1);
	if (lastRevision?.index !== undefined) {
		const tail = text
			.slice(lastRevision.index + lastRevision[0].length)
			.replace(/^(?:还是|改成|改到|那就)[，,。.\s]*/, "")
			.trim();
		if (tail.length >= 2) text = tail;
	}
	return text.replace(/，{2,}/g, "，").replace(/^，|，$/g, "").trim();
}

function formatCleanedText(text: string, context: SpeechFormatContext): string {
	if (isChatContext(context)) return text;
	if (isFormalContext(context)) {
		return text.replace(/[啊呀哈呢呗嘛啦]+[。.!！?？]?$/u, "").trim();
	}
	return text;
}

function heuristicStructure(transcript: string): StructuredSpeech {
	const cleaned = cleanSpeechText(transcript);
	const lines = cleaned
		.split(/\r?\n/)
		.map((l) => l.trim())
		.filter(Boolean);
	const headline = lines[0]?.slice(0, 2000) ?? cleaned.slice(0, 2000);
	return {
		headline,
		detail: lines.length > 1 ? lines.join("\n") : "",
	};
}

export function shouldCleanSpeechLocally(text: string): boolean {
	const trimmed = text.trim();
	if (!trimmed) return true;
	const singleLine = !trimmed.includes("\n");
	const sentenceCount = trimmed.split(/[。！？!?；;]/).filter((part) => part.trim()).length;
	if (singleLine && trimmed.length <= 200 && sentenceCount <= 3) return true;
	if (trimmed.length <= 48 && sentenceCount <= 1) return true;
	if (/^(我|你|他|她|咱|我们|你们).{0,32}(去|来|回|到|在|要|想|先|等|晚点|马上)/.test(trimmed)) {
		return true;
	}
	return false;
}

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 驼峰 / 连续大写拆成可匹配的空格形式：InputSurface → Input Surface。 */
function spacedHotwordForm(keyword: string): string {
	return keyword
		.replace(/([a-z\d])([A-Z])/g, "$1 $2")
		.replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
		.trim();
}

/**
 * 免费档 / 云失败兜底：只做去空格、大小写、驼峰拆分级的热词对齐。
 * 不做谐音或编辑距离深纠（那是付费云端「专有名词增强」的卖点）。
 * 注意：cleanSpeechText 会去掉空白，所以 compact 匹配是主路径。
 */
export function applyLocalHotwordHints(
	text: string,
	keywords: string[] | undefined | null,
): string {
	if (!keywords?.length || !text) return text;
	let out = text;
	const sorted = [...keywords]
		.map((k) => k.trim())
		.filter(Boolean)
		.sort((a, b) => b.length - a.length);

	for (const kw of sorted) {
		const exactRe = new RegExp(escapeRegExp(kw), "gi");
		if (exactRe.test(out)) {
			out = out.replace(new RegExp(escapeRegExp(kw), "gi"), kw);
			continue;
		}

		const forms: string[] = [];
		const compact = kw.replace(/\s+/g, "");
		if (compact.toLowerCase() !== kw.toLowerCase()) forms.push(compact);
		const spaced = spacedHotwordForm(kw);
		if (spaced !== kw) forms.push(spaced);
		// 驼峰词在去空白后的文本里：InputSurface ↔ inputsurface
		if (spaced !== kw) forms.push(spaced.replace(/\s+/g, ""));

		for (const form of forms) {
			const pattern =
				/\s/.test(form) ?
					escapeRegExp(form).replace(/\\ /g, "\\s+")
				:	escapeRegExp(form);
			const re = new RegExp(pattern, "gi");
			if (!re.test(out)) continue;
			out = out.replace(new RegExp(pattern, "gi"), kw);
			break;
		}
	}
	return out;
}

/**
 * Pro/试用后处理：仅在 profileKeywords 含目标词时，做语境敏感的近音/错识替换。
 * 不全局替换（避免把普通 "on" 改成 ARR）。
 */
export function applyContextualAcronymFixes(
	text: string,
	keywords: string[] | undefined | null,
): string {
	if (!keywords?.length || !text) return text;
	const has = (kw: string) =>
		keywords.some((k) => k.replace(/\s+/g, "").toLowerCase() === kw.replace(/\s+/g, "").toLowerCase());
	let out = text;

	if (has("ARR")) {
		const investCue = /续费|营收|收入|估值|万|亿|公司|年|arr/i.test(out);
		if (investCue) {
			// 「今年on大概」「今年 are 大概」——中英夹杂，\b 不可靠
			out = out.replace(
				/(?<=[\u4e00-\u9fff\s,，、]|^)(on|are|aar)(?=[\u4e00-\u9fff\s,，、.。！？!?]|$)/gi,
				"ARR",
			);
		}
	}
	if (has("resolver")) {
		out = out.replace(/\breserver\b/gi, "resolver");
	}
	return out;
}

function parseStructureJson(text: string, fallback: string): StructuredSpeech | null {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
	const candidate = fenced ?? text;
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start < 0 || end <= start) return null;
	try {
		const raw = JSON.parse(candidate.slice(start, end + 1)) as {
			text?: string;
			headline?: string;
			summary?: string;
			detail?: string;
			bullets?: string[];
			todos?: string[];
		};
		const directText = String(raw.text ?? "").trim();
		if (directText) return { headline: directText, detail: "" };
		const headline = String(raw.headline ?? raw.summary ?? "").trim();
		const bullets = [...(raw.bullets ?? []), ...(raw.todos ?? [])]
			.map((b) => String(b).trim())
			.filter(Boolean);
		const detailBody = String(raw.detail ?? "").trim();
		const detail = [detailBody, bullets.length ? bullets.map((b) => `• ${b}`).join("\n") : ""]
			.filter(Boolean)
			.join("\n\n");
		if (!headline && !detail) return null;
		return {
			headline: headline || fallback.slice(0, 60),
			detail: detail || fallback,
		};
	} catch {
		return null;
	}
}

/** 语音输入净化：去口头禅、修语序、按 App 场景轻格式化（不跑 Agent / 不执行技能）。 */
export async function structureSpeechText(
	transcript: string,
	context: SpeechFormatContext = {},
): Promise<StructuredSpeech> {
	const text = transcript.trim();
	if (!text) return { headline: "", detail: "" };
	if (context.cleanupLevel === "off") return { headline: text, detail: "" };
	let cleaned = applyLocalHotwordHints(
		formatCleanedText(cleanSpeechText(text), context),
		context.profileKeywords,
	);
	// preferQuality（付费/试用）：短缩写语境纠错；免费本地快路径不做
	if (context.preferQuality) {
		cleaned = applyContextualAcronymFixes(cleaned, context.profileKeywords);
	}
	if (context.cleanupLevel === "minimal") return { headline: cleaned, detail: "" };
	// preferQuality（付费/试用）：短命令也上云；免费仍走本地快路径 + 上面的轻量热词
	const useLocal = !context.preferQuality && shouldCleanSpeechLocally(text);
	if (useLocal) return { headline: cleaned, detail: "" };
	if (context.allowCloud === false || !hasFastModelApiKey()) {
		const local = heuristicStructure(text);
		const headline = context.preferQuality
			? applyContextualAcronymFixes(
					applyLocalHotwordHints(local.headline, context.profileKeywords),
					context.profileKeywords,
				)
			: applyLocalHotwordHints(local.headline, context.profileKeywords);
		const detail = context.preferQuality
			? applyContextualAcronymFixes(
					applyLocalHotwordHints(local.detail, context.profileKeywords),
					context.profileKeywords,
				)
			: applyLocalHotwordHints(local.detail, context.profileKeywords);
		return { headline, detail };
	}

	const app = [context.app, context.windowTitle].filter(Boolean).join(" · ") || "未知";
	const keywordNote =
		context.profileKeywords?.length ?
			`\n用户常用专名（听写错字请纠正为下列写法）：${context.profileKeywords.join("、")}`
		:	"";
	const confusionNote = context.profileKeywords?.length
		? `\n常见听写错识（有语境时纠正，勿无故替换日常词）：ARR←on/are；resolver←reserver。`
		: "";
	const prompt = `用户刚说完一段语音输入。请做“输入净化”，不是总结，不要扩写，不要补充事实。

目标：
- 去掉“嗯、呃、额、那个、就是、然后”等无用口头禅
- 若用户先说错再改口（如「九点……啊不对……九点半」），只保留最终决定，不要把改口过程写进结果
- “啊、呀、呢、哈、嘛、啦”等可能是自然语气词：微信/飞书/Slack 私聊可少量保留，Gmail/邮件/文档应去掉或改成更正式表达
- 修正明显前后颠倒、重复、断句混乱
- 保留用户原意和信息量，不要新增“待补充”“可能是”等解释
- 根据当前 App/场景调整语气与格式：
  - 微信/飞书：短、自然、像聊天气泡
  - Slack：可偏英文工作区语气（若原文偏中文仍用中文）
  - Gmail/邮件：稍完整、礼貌，可分句
  - 文档/笔记：可用简短项目符号

只输出 JSON：
{
  "text": "可直接输入到当前 App 的最终文本"
}

当前 App/窗口：${app}${keywordNote}${confusionNote}
已去除口头禅和改口过程的文本：
${cleaned}`;

	try {
		const out = await generateFastText(prompt, {
			maxOutputTokens: 400,
			temperature: 0.2,
			feature: "voice_structure",
		});
		const parsed = parseStructureJson(out, cleaned);
		if (!parsed) {
			const local = heuristicStructure(text);
			return {
				headline: applyContextualAcronymFixes(
					applyLocalHotwordHints(local.headline, context.profileKeywords),
					context.profileKeywords,
				),
				detail: applyContextualAcronymFixes(
					applyLocalHotwordHints(local.detail, context.profileKeywords),
					context.profileKeywords,
				),
			};
		}
		context.onCloudSuccess?.();
		return {
			headline: applyContextualAcronymFixes(parsed.headline, context.profileKeywords),
			detail: applyContextualAcronymFixes(parsed.detail, context.profileKeywords),
		};
	} catch {
		const local = heuristicStructure(text);
		return {
			headline: applyContextualAcronymFixes(
				applyLocalHotwordHints(local.headline, context.profileKeywords),
				context.profileKeywords,
			),
			detail: applyContextualAcronymFixes(
				applyLocalHotwordHints(local.detail, context.profileKeywords),
				context.profileKeywords,
			),
		};
	}
}
