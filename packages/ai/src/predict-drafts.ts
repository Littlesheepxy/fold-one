import { hasFastModelApiKey, hasFastVisionApiKey } from "./model-choice.js";
import { generateFastText } from "./fast-text.js";
import { generateFastVision } from "./fast-vision.js";

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
	profileBrief?: string;
	confidenceLevel?: "high" | "medium" | "low";
	anchor?: string | null;
	allowCloud?: boolean;
	/** 代回：截图路径，有则优先走多模态（跳过 OCR） */
	screenshotPath?: string;
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
	if (input.allowCloud === false) return heuristicDrafts(input);

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
	const profileNote = input.profileBrief?.trim()
		? `\n用户画像（导入自 AI 助手）：\n${input.profileBrief.trim()}\n- 画像只影响语气/措辞/专名，禁止据此改变对话双方身份或回复方向——你仍是被截图/摘要里对方最新消息追问、告知的那一方，只能顺着这个立场作答。`
		: "";
	const replyRules =
		input.surface === "reply"
			? [
					"你是「我」，正在帮用户写下一条要发出去的新消息。",
					"先在截图/摘要里区分：对方气泡（对方说的）vs 己方气泡（用户已发过的）。",
					"必须回应对方最新一条（或整段未回完的诉求），生成尚未发出的新回复。",
					"严禁复述、改写、拼接用户已经发过的句子；截图里己方气泡只作立场参考，不能当草案输出。",
					"用户语音意图是写作指令（如同意/拒绝/推迟/解释），不是要原样发给对方。",
					"语气像即时聊天：短、自然、有上下文；不要客服腔/公文腔；不要反问除非确实缺信息；不要元说明或发送按钮。",
				].join("")
			: input.surface === "todo"
				? "1-2 条待办/跟进表述"
				: "1-2 条可执行摘要";

	const tryParse = async (text: string) => {
		const parsed = parseDraftJson(text);
		if (!parsed) return null;
		input.onCloudSuccess?.();
		return parsed;
	};

	// 代回优先：截图直送多模态，砍掉 OCR 往返
	if (input.surface === "reply" && input.screenshotPath && hasFastVisionApiKey()) {
		const visionPrompt = `你是知更桌面助手。请看截图里的当前聊天窗口，为用户写「下一条要发送」的拟回复。
用户指令：「${input.intent}」

硬性规则：
- 只输出 JSON 数组，每项是一句可直接发送的中文（2-3 条候选）
- 右侧/绿色/己方气泡 = 用户已说过的话 → 禁止原样或近似复述进输出
- 左侧/对方气泡 = 需要回应的内容 → 以对方最新消息为主答复
- ${replyRules}
${confidenceNote ? `- ${confidenceNote}\n` : ""}${profileNote}- 不要代用户发送；下方工作现场仅作补充，以截图对话为准

情境锚点：${input.anchor ?? "未知"}

工作现场（轨迹、文件、剪贴板等）：
${workContext}

错误示例（禁止）：把用户已发的「昨天都说好了啊」再输出一遍
正确示例：针对对方最新顾虑，新写一句推进/安抚/拍板

输出示例：["新回复一","新回复二"]`;
		try {
			const text = await generateFastVision(visionPrompt, { path: input.screenshotPath }, {
				maxOutputTokens: 640,
				temperature: 0.4,
				feature: "voice_reply",
			});
			const parsed = await tryParse(text);
			if (parsed) return parsed;
		} catch (err) {
			console.warn("[predict-drafts] vision reply failed, fallback text", err);
		}
	}

	if (!hasFastModelApiKey()) return heuristicDrafts(input);

	const prompt = `你是知更桌面助手。根据用户当前情境，为「${input.intent}」生成${action}候选。
要求：
- 只输出 JSON 数组，每项是一句可直接复制/插入的中文文本字符串
${confidenceNote ? `- ${confidenceNote}\n` : ""}${profileNote}- ${replyRules}
- 不要代用户发送，只给文本
${input.surface === "reply" ? "- 页面摘要里若出现用户已发内容，禁止复述；只写尚未发出的新回复\n" : ""}
情境锚点：${input.anchor ?? "未知"}

工作现场（轨迹、文件、剪贴板等）：
${workContext}

当前页面摘要：
${screen}

输出示例：["第一句","第二句"]`;

	try {
		const text = await generateFastText(prompt, {
			maxOutputTokens: 640,
			temperature: 0.35,
			feature: input.surface === "reply" ? "voice_reply" : "noticed",
		});
		const parsed = await tryParse(text);
		if (parsed) return parsed;
		return heuristicDrafts(input);
	} catch {
		return heuristicDrafts(input);
	}
}
