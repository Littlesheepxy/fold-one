import { generateText } from "ai";
import { hasPlannerApiKey } from "./planner.js";
import { toLanguageModel } from "./providers.js";
import { resolveModelChoice } from "./types.js";

export interface StructuredSpeech {
	headline: string;
	detail: string;
}

export interface SpeechFormatContext {
	app?: string | null;
	windowTitle?: string | null;
}

function isChatContext(context: SpeechFormatContext): boolean {
	return /微信|wechat|飞书|lark|钉钉|dingtalk|slack|telegram|消息|chat/i.test(
		[context.app, context.windowTitle].filter(Boolean).join(" "),
	);
}

function isFormalContext(context: SpeechFormatContext): boolean {
	return /mail|gmail|outlook|邮件|邮箱|文档|docs|notion|飞书文档/i.test(
		[context.app, context.windowTitle].filter(Boolean).join(" "),
	);
}

function cleanSpeechText(transcript: string): string {
	return transcript
		.trim()
		.replace(/[，,]\s*/g, "，")
		.replace(/\s+/g, "")
		.replace(/^(嗯|呃|额|那个|就是|然后|诶|哎)[，,。.\s]*/g, "")
		.replace(/[，,。.\s]*(嗯|呃|额|那个|就是|然后|诶|哎)$/g, "")
		.replace(/(，)?(嗯|呃|额|那个|就是|然后)(，)?/g, "，")
		.replace(/，{2,}/g, "，")
		.replace(/^，|，$/g, "")
		.trim();
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

function shouldCleanLocally(text: string): boolean {
	const singleLine = !text.includes("\n");
	const sentenceCount = text.split(/[。！？!?；;]/).filter((part) => part.trim()).length;
	if (singleLine && text.length <= 120 && sentenceCount <= 2) return true;
	if (/^(我|你|他|她|咱|我们|你们).{0,24}(去|来|回|到|在|要|想|先|等|晚点|马上)/.test(text)) {
		return true;
	}
	return false;
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
	const cleaned = formatCleanedText(cleanSpeechText(text), context);
	if (shouldCleanLocally(text)) return { headline: cleaned, detail: "" };
	if (!hasPlannerApiKey()) return heuristicStructure(text);

	const app = [context.app, context.windowTitle].filter(Boolean).join(" · ") || "未知";
	const prompt = `用户刚说完一段语音输入。请做“输入净化”，不是总结，不要扩写，不要补充事实。

目标：
- 去掉“嗯、呃、额、那个、就是、然后”等无用口头禅
- “啊、呀、呢、哈、嘛、啦”等可能是自然语气词：微信/私聊可保留，邮件/文档应去掉或改成更正式表达
- 修正明显前后颠倒、重复、断句混乱
- 保留用户原意和信息量，不要新增“待补充”“可能是”等解释
- 根据当前 App/场景轻微调整格式：
  - 微信/飞书/私聊：短、自然、像聊天
  - 邮件/Outlook/Gmail：稍完整、礼貌、可分段
  - 文档/笔记：可用简短项目符号

只输出 JSON：
{
  "text": "可直接输入到当前 App 的最终文本"
}

当前 App/窗口：${app}
用户原话：
${text}`;

	try {
		const model = toLanguageModel(resolveModelChoice("planner"));
		const { text: out } = await generateText({ model, prompt });
		return parseStructureJson(out, text) ?? heuristicStructure(text);
	} catch {
		return heuristicStructure(text);
	}
}
