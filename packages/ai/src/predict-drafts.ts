import { generateText } from "ai";
import { hasPlannerApiKey } from "./planner.js";
import { toLanguageModel } from "./providers.js";
import { resolveModelChoice } from "./types.js";

export interface PredictDraftLine {
	id: string;
	text: string;
}

export type PredictSurface = "reply" | "task" | "todo";

export interface PredictDraftInput {
	intent: string;
	surface: PredictSurface;
	contextSnippet?: string;
	anchor?: string | null;
}

function surfaceActionLabel(surface: PredictSurface): string {
	if (surface === "reply") return "拟回复";
	if (surface === "todo") return "拟待办";
	return "建议";
}

function heuristicDrafts(input: PredictDraftInput): PredictDraftLine[] {
	const { intent, surface } = input;
	if (surface === "reply") {
		return [
			{ id: "d1", text: "好的，我今天下午前发给你。" },
			{ id: "d2", text: "收到，我整理一下稍后回复你。" },
			{ id: "d3", text: "谢谢，我确认后尽快给你答复。" },
		];
	}
	if (surface === "todo") {
		const title = intent.replace(/^记(录|下)?|待办[:：]?/i, "").trim() || intent;
		return [
			{ id: "d1", text: `待办：${title}` },
			{ id: "d2", text: `跟进：${title}（今天下班前）` },
		];
	}
	return [
		{ id: "d1", text: intent },
		{ id: "d2", text: `${intent}（基于当前页面）` },
	];
}

function parseDraftJson(text: string): PredictDraftLine[] | null {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
	const candidate = fenced ?? text;
	const start = candidate.indexOf("[");
	const end = candidate.lastIndexOf("]");
	if (start < 0 || end <= start) return null;
	try {
		const raw = JSON.parse(candidate.slice(start, end + 1)) as unknown;
		if (!Array.isArray(raw)) return null;
		const lines = raw
			.map((item, i) => {
				if (typeof item === "string" && item.trim()) {
					return { id: `d${i + 1}`, text: item.trim() };
				}
				if (item && typeof item === "object" && "text" in item) {
					const t = String((item as { text: unknown }).text).trim();
					if (t) return { id: `d${i + 1}`, text: t };
				}
				return null;
			})
			.filter((x): x is PredictDraftLine => x != null);
		return lines.length ? lines.slice(0, 4) : null;
	} catch {
		return null;
	}
}

export async function generatePredictDrafts(input: PredictDraftInput): Promise<PredictDraftLine[]> {
	if (!hasPlannerApiKey()) return heuristicDrafts(input);

	const action = surfaceActionLabel(input.surface);
	const context = input.contextSnippet?.trim().slice(0, 1200) ?? "（无页面文本）";
	const prompt = `你是 Fold 桌面助手。根据用户当前情境，为「${input.intent}」生成${action}候选。
要求：
- 只输出 JSON 数组，每项是一句可直接复制/插入的中文文本字符串
- ${input.surface === "reply" ? "2-3 条不同语气的回复草案，不要包含发送按钮或元说明" : input.surface === "todo" ? "1-2 条待办/跟进表述" : "1-2 条可执行摘要"}
- 不要代用户发送，只给文本

情境锚点：${input.anchor ?? "未知"}
页面摘要：
${context}

输出示例：["第一句","第二句"]`;

	try {
		const model = toLanguageModel(resolveModelChoice("planner"));
		const { text } = await generateText({ model, prompt });
		return parseDraftJson(text) ?? heuristicDrafts(input);
	} catch {
		return heuristicDrafts(input);
	}
}
