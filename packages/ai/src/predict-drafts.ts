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
	contextSummary?: string;
	contextBrief?: string;
	confidenceLevel?: "high" | "medium" | "low";
	anchor?: string | null;
	allowCloud?: boolean;
	onCloudSuccess?: () => void;
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
			{ id: "d1", text: "好的，没问题。" },
			{ id: "d2", text: "不好意思，这次可能不太方便，我们改天再说？" },
			{ id: "d3", text: "收到，我确认一下稍后回复你。" },
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
	if (input.allowCloud === false || !hasPlannerApiKey()) return heuristicDrafts(input);

	const action = surfaceActionLabel(input.surface);
	const screen = input.contextSnippet?.trim().slice(0, 1200) ?? "（无页面文本）";
	const workContext =
		input.contextBrief?.trim() ||
		input.contextSummary?.trim().slice(0, 1200) ||
		"（暂无工作现场）";
	const confidenceNote =
		input.confidenceLevel === "low"
			? "情境把握较低：不要编造未在工作现场出现的文件名或聊天内容；草案应更通用。"
			: input.confidenceLevel === "medium"
				? "情境把握中等：仅当工作现场明确出现文件/素材时才引用。"
				: "";
	const prompt = `你是 Fold 桌面助手。根据用户当前情境，为「${input.intent}」生成${action}候选。
要求：
- 只输出 JSON 数组，每项是一句可直接复制/插入的中文文本字符串
${confidenceNote ? `- ${confidenceNote}\n` : ""}- ${input.surface === "reply" ? "用户意图是写作指令，不是要原样发给对方。结合工作现场（近期文件、剪贴板、切换记录）与页面摘要/截图 OCR 里的最近聊天内容，生成 2-3 条可直接发送的回复。语气要像即时聊天，短、自然、有上下文；若用户提到刚操作的文件或剪贴板内容，可自然引用；不要像客服/公文。若用户指定同意、拒绝、推迟、确认、解释、幽默等立场/语气，必须严格遵循；不要反问“你指哪方面”，除非聊天里确实无法判断；不要强行混入相反立场，不要包含发送按钮或元说明" : input.surface === "todo" ? "1-2 条待办/跟进表述" : "1-2 条可执行摘要"}
- 不要代用户发送，只给文本

情境锚点：${input.anchor ?? "未知"}

工作现场（轨迹、文件、剪贴板等）：
${workContext}

当前页面摘要：
${screen}

输出示例：["第一句","第二句"]`;

	try {
		const model = toLanguageModel(resolveModelChoice("planner"));
		const { text } = await generateText({ model, prompt });
		const parsed = parseDraftJson(text);
		if (!parsed) return heuristicDrafts(input);
		input.onCloudSuccess?.();
		return parsed;
	} catch {
		return heuristicDrafts(input);
	}
}
