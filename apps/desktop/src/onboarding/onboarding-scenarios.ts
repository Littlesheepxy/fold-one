import { BRAND_ICONS } from "../settings/components/brand-icons";

export type OnboardingScenarioId = "wechat" | "gmail" | "feishu" | "knowledge" | "slack";

export type OnboardingScenario = {
	id: OnboardingScenarioId;
	label: string;
	icon: string;
	header: string;
	kind: "chat" | "email" | "document";
	peerName: string;
	/** 口述原文（带口头禅 / 改口） */
	voiceSample: string;
	/** 整理后应得到的最终文案（演示页以此为准，避免模型原样返回） */
	voiceCleaned: string;
	voiceHints: string[];
	replyIncoming: string;
	replyDraft: string;
	structureApp: string;
};

export const ONBOARDING_SCENARIOS: OnboardingScenario[] = [
	{
		id: "feishu",
		label: "飞书",
		icon: BRAND_ICONS.feishu,
		header: "预算评审群",
		kind: "chat",
		peerName: "财务同学",
		voiceSample:
			"跟群里说一下，预算表上午九点开始对，哦不对，我们九点半开始，那个，先约一个评审会。",
		voiceCleaned: "我们上午九点半开始对预算表，先约一个评审会。",
		voiceHints: ["理顺了语序", "听到你改变主意了：9 点 → 9 点半", "只保留最终安排"],
		replyIncoming: "预算表今天能对齐吗？",
		replyDraft: "我今晚改一版，明早 10 点前发群里，大家先对关键假设。",
		structureApp: "飞书",
	},
	{
		id: "gmail",
		label: "Gmail",
		icon: BRAND_ICONS.google,
		header: "回复：Q3 评审纪要",
		kind: "email",
		peerName: "Sarah",
		voiceSample:
			"嗯，就跟她说，会议纪要我今晚整理完，呃，明天上午发她。抄送一下晓明，主题就写 Q3 评审跟进。",
		voiceCleaned: "会议纪要我今晚整理完，明天上午发给你，并抄送晓明。主题：Q3 评审跟进。",
		voiceHints: ["整理成邮件语气", "补全抄送与主题", "去掉口头语"],
		replyIncoming: "Could you share the deck before our sync on Friday?",
		replyDraft: "I'll send the deck by Thursday EOD and loop in Xiaoming on the follow-ups.",
		structureApp: "Gmail",
	},
	{
		id: "knowledge",
		label: "知识库",
		icon: BRAND_ICONS.notion,
		header: "项目复盘 · 本周决策",
		kind: "document",
		peerName: "项目知识库",
		voiceSample:
			"记一下这周的结论，嗯，先做企业版，个人版往后放，然后负责人是小林，下周三之前出第一版。",
		voiceCleaned: "本周决策\n• 优先推进企业版，个人版延后\n• 负责人：小林\n• 截止时间：下周三前完成第一版",
		voiceHints: ["提取了关键决策", "整理为知识库条目", "负责人和截止时间更清晰"],
		replyIncoming: "这周最终定了哪些事？",
		replyDraft: "优先推进企业版，个人版延后；小林负责，下周三前完成第一版。",
		structureApp: "知识库",
	},
	{
		id: "slack",
		label: "Slack",
		icon: BRAND_ICONS.slack,
		header: "#product-updates",
		kind: "chat",
		peerName: "Alex",
		voiceSample:
			"呃，帮我回一下，就说 demo 环境今晚升级，大概，嗯，十一点到十二点会有短暂不可用。",
		voiceCleaned:
			"Demo env will be upgraded tonight between 11–12pm — brief downtime expected.",
		voiceHints: ["英文工作区也听得懂", "时间窗口写清楚", "语气专业但不生硬"],
		replyIncoming: "Any downtime expected for the demo env tonight?",
		replyDraft: "Yes — upgrading tonight between 11pm–12am PT. Brief blip, will post in #status when done.",
		structureApp: "Slack",
	},
	{
		id: "wechat",
		label: "微信",
		icon: BRAND_ICONS.wechat,
		header: "产品群",
		kind: "chat",
		peerName: "同事",
		voiceSample: "那个，咱们晨会改到九点半吧。",
		voiceCleaned: "咱们晨会改到九点半吧。",
		voiceHints: ["去掉了填充词", "保留聊天口吻", "表达更直接"],
		replyIncoming: "方案文档什么时候能发我看看？",
		replyDraft: "周五前发你完整版，今晚先给一版摘要。",
		structureApp: "微信",
	},
];

export function getOnboardingScenario(id: OnboardingScenarioId): OnboardingScenario {
	return ONBOARDING_SCENARIOS.find((s) => s.id === id) ?? ONBOARDING_SCENARIOS[0]!;
}
