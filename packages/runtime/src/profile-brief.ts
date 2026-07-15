import type { UserProfileData } from "@fold/memory";

const CJK_TOKEN = /[\u4e00-\u9fff]{2,12}/g;
const LATIN_TOKEN = /\b[A-Z][A-Za-z0-9]{1,15}\b/g;

const STOP_WORDS = new Set([
	"用户",
	"项目",
	"工作",
	"沟通",
	"偏好",
	"习惯",
	"工具",
	"领域",
	"角色",
	"身份",
	"概述",
	"摘要",
	"Profile",
	"Context",
	"Active",
	"Overview",
	"Instructions",
	"Identity",
	"Career",
]);

export interface OnboardingDemoSentence {
	spoken: string;
	beforeTranscript: string;
	incoming: string;
}

function uniqueTokens(tokens: string[]): string[] {
	const out: string[] = [];
	for (const raw of tokens) {
		const t = raw.trim();
		if (!t || t.length < 2 || STOP_WORDS.has(t)) continue;
		if (!out.includes(t)) out.push(t);
	}
	return out;
}

function tokensFromText(text: string): string[] {
	if (!text.trim()) return [];
	const cjk = text.match(CJK_TOKEN) ?? [];
	const latin = text.match(LATIN_TOKEN) ?? [];
	return uniqueTokens([...cjk, ...latin]);
}

function tokensFromArchive(archive?: string): string[] {
	if (!archive?.trim()) return [];
	const lines = archive.split(/\r?\n/);
	const tokens: string[] = [];
	for (const line of lines) {
		const heading = line.match(/^#+\s+(.+)/);
		if (heading?.[1]) tokens.push(...tokensFromText(heading[1]));
		if (/^##\s+/.test(line)) {
			const title = line.replace(/^#+\s+/, "").trim();
			if (title.length >= 2 && title.length <= 24) tokens.push(title);
		}
		const quoted = line.match(/[「『"]([^」』"]{2,16})[」』"]/g);
		if (quoted) {
			for (const q of quoted) {
				tokens.push(q.replace(/[「『"』」]/g, ""));
			}
		}
	}
	return uniqueTokens(tokens);
}

export function extractProfileKeywords(
	profile: UserProfileData | null,
	limit = 8,
): string[] {
	if (!profile) return [];
	const pool: string[] = [];
	if (profile.role) pool.push(profile.role);
	for (const d of profile.domains ?? []) pool.push(d);
	for (const t of profile.preferredTools ?? []) pool.push(t);
	for (const c of profile.constraints ?? []) pool.push(...tokensFromText(c));
	if (profile.summary) pool.push(...tokensFromText(profile.summary));
	pool.push(...tokensFromArchive(profile.migrationArchive));
	return uniqueTokens(pool).slice(0, limit);
}

export function buildProfileBrief(profile: UserProfileData | null): string {
	if (!profile) return "";
	const lines: string[] = [];
	if (profile.role) lines.push(`角色：${profile.role}`);
	if (profile.summary) lines.push(`概述：${profile.summary}`);
	if (profile.domains?.length) lines.push(`领域：${profile.domains.join("、")}`);
	if (profile.communicationStyle) lines.push(`沟通风格：${profile.communicationStyle}`);
	if (profile.preferredTools?.length) lines.push(`常用工具：${profile.preferredTools.join("、")}`);
	if (profile.workPatterns?.length) lines.push(`工作习惯：${profile.workPatterns.slice(0, 3).join("；")}`);
	if (profile.constraints?.length) lines.push(`约束：${profile.constraints.slice(0, 3).join("；")}`);
	const keywords = extractProfileKeywords(profile, 12);
	if (keywords.length) lines.push(`常用专名：${keywords.join("、")}`);
	return lines.join("\n");
}

const FALLBACK_DEMO: OnboardingDemoSentence = {
	incoming: "方案文档什么时候能发我？",
	spoken: "跟晓明说一声，方案文档周五前发他邮箱。",
	beforeTranscript: "跟小明说一声，fang案闻档周五前发他邮箱。",
};

function homophoneBefore(word: string): string {
	if (word === "晓明") return "小明";
	if (/方案/i.test(word)) return "fang案";
	if (/文档/i.test(word)) return "闻档";
	if (/PPT/i.test(word)) return "PP踢";
	return word;
}

export function buildOnboardingDemoSentence(
	profile: UserProfileData | null,
): OnboardingDemoSentence {
	const keywords = extractProfileKeywords(profile, 3);
	if (keywords.length < 2) return { ...FALLBACK_DEMO };

	const name = keywords[0]!;
	const term = keywords[1]!;
	const incoming = `${term}什么时候能发我看看？`;
	const spoken = `跟${name}说一声，${term}周五前发他。`;

	const beforeTranscript = spoken
		.replace(name, homophoneBefore(name))
		.replace(term, homophoneBefore(term));

	return {
		incoming,
		spoken,
		beforeTranscript: beforeTranscript || FALLBACK_DEMO.beforeTranscript,
	};
}

export function buildProfileChecklist(profile: UserProfileData | null): string[] {
	if (!profile) return [];
	const items: string[] = [];
	if (profile.role) items.push(`知道你是 ${profile.role}`);
	if (profile.communicationStyle) items.push(`语气：${profile.communicationStyle}`);
	const keywords = extractProfileKeywords(profile, 4);
	if (keywords.length) items.push(`识别专名：${keywords.slice(0, 3).join("、")}`);
	items.push("不是通用客服腔");
	return items.slice(0, 4);
}
