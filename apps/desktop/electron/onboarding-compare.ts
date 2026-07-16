import { loadProfileMemories } from "@fold/memory";
import {
	buildOnboardingDemoSentence,
	buildProfileBrief,
	buildProfileChecklist,
	extractProfileKeywords,
	generatePredictDrafts,
	structureSpeechText,
} from "@fold/runtime";
import { resolveSmartActionAccess } from "./config.js";
import { getStoredProfile } from "./profile-import.js";

export interface OnboardingCompareResult {
	incoming: string;
	before: { transcript: string; reply: string };
	after: { transcript: string; reply: string };
	keywords: string[];
	checklist: string[];
	profileSummary?: {
		role?: string;
		domains?: string[];
		communicationStyle?: string;
	};
}

const GENERIC_REPLY = "好的，没问题，我尽快整理给您。";

export async function runOnboardingCompareDemo(opts: {
	withProfile: boolean;
}): Promise<OnboardingCompareResult> {
	const profile = opts.withProfile ? getStoredProfile() : null;
	const demo = buildOnboardingDemoSentence(profile);
	const smartAccess = resolveSmartActionAccess();

	if (!opts.withProfile || !profile) {
		return {
			incoming: demo.incoming,
			before: { transcript: demo.beforeTranscript, reply: GENERIC_REPLY },
			after: {
				transcript: demo.spoken,
				reply: "周五前发你完整版，今晚先给一版摘要。",
			},
			keywords: extractProfileKeywords(profile),
			checklist: buildProfileChecklist(profile),
		};
	}

	const profileBrief = buildProfileBrief(profile);
	const keywords = extractProfileKeywords(profile, 8);
	const chatContext = { app: "微信", windowTitle: "工作群" };

	const [structured, drafts] = await Promise.all([
		structureSpeechText(demo.spoken, {
			...chatContext,
			profileKeywords: keywords,
			allowCloud: smartAccess.allowed,
		}),
		generatePredictDrafts({
			intent: `回复对方：${demo.incoming}`,
			surface: "reply",
			contextSnippet: `对方消息：${demo.incoming}`,
			contextBrief: `用户在微信工作群，需要回复进度。`,
			profileBrief,
			anchor: "微信 · 工作群",
			allowCloud: smartAccess.allowed,
		}),
	]);

	const afterTranscript = structured.detail
		? `${structured.headline}\n${structured.detail}`.trim()
		: structured.headline || demo.spoken;
	const afterReply = drafts[0]?.text ?? "周五前发你完整版，今晚先给一版摘要。";

	return {
		incoming: demo.incoming,
		before: { transcript: demo.beforeTranscript, reply: GENERIC_REPLY },
		after: { transcript: afterTranscript, reply: afterReply },
		keywords,
		checklist: buildProfileChecklist(profile),
		profileSummary: {
			role: profile.role,
			domains: profile.domains?.slice(0, 3),
			communicationStyle: profile.communicationStyle,
		},
	};
}

export async function runOnboardingStructureVoice(
	transcript: string,
	opts?: { app?: string; windowTitle?: string },
): Promise<string> {
	const profile = loadProfileMemories();
	const keywords = extractProfileKeywords(profile, 12);
	const smartAccess = resolveSmartActionAccess();
	const structured = await structureSpeechText(transcript.trim(), {
		app: opts?.app ?? "微信",
		windowTitle: opts?.windowTitle ?? "Onboarding",
		profileKeywords: keywords,
		allowCloud: smartAccess.allowed,
		preferQuality: true,
	});
	const body = [structured.headline, structured.detail]
		.filter((p) => p.trim())
		.join("\n\n");
	return body || transcript.trim();
}

const ONBOARDING_AHA_SCENARIO = {
	activeApp: "Google Chrome",
	activeWindow: "飞书文档 - Q3 预算评审",
	anchor: "飞书文档 · Q3 预算",
	trail: ["Finder", "飞书", "Google Chrome"],
	recentPages: [{ title: "Q3 预算评审", url: "https://feishu.cn/docs/budget-q3" }],
	contextBrief: "用户正在查看 Q3 预算文档，可能要对齐评审时间或回复相关同事。",
	confidenceLevel: "medium" as const,
};

export function getOnboardingAhaInput() {
	return { ...ONBOARDING_AHA_SCENARIO };
}
