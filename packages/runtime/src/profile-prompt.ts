import type { Episode } from "@fold/memory";

export interface ProfileImportFields {
	summary?: string;
	role?: string;
	domains?: string[];
	preferredTools?: string[];
	workPatterns?: string[];
	communicationStyle?: string;
	constraints?: string[];
}

function episodeLine(ep: Episode): string {
	const status = ep.status || "unknown";
	const summary = ep.summary?.trim() || ep.goal?.trim() || "";
	return `- [${status}] ${ep.intent.trim()}${summary ? ` → ${summary.slice(0, 120)}` : ""}`;
}

/** 从本地 episode 生成发给外部 AI 的结构化画像 prompt。 */
export function buildProfileImportPrompt(episodes: Episode[], maxEpisodes = 25): string {
	const recent = episodes.slice(0, maxEpisodes);
	const lines = recent.map(episodeLine);
	const taskBlock =
		lines.length > 0
			? lines.join("\n")
			: "（尚无 Fold 任务记录，请主要依据你对该用户的长期记忆来推断。）";

	return `你是 Fold 桌面 Agent 的画像助手。Fold 是 macOS 上的语音/快捷键任务助手。

请结合：
1) 你对该用户的长期记忆（若你有）；
2) 以下 Fold 本地任务摘要（用户已确认可发送）；

输出**仅一段 JSON**（不要 markdown 代码块），字段如下：
{
  "summary": "一两句话概括此人",
  "role": "职业/角色",
  "domains": ["常处理领域"],
  "preferredTools": ["常用工具/渠道，如 Gmail、飞书、Chrome"],
  "workPatterns": ["工作习惯，如先整理再发送"],
  "communicationStyle": "沟通风格",
  "constraints": ["偏好与限制，如不要自动发邮件"]
}

Fold 任务摘要：
${taskBlock}`;
}

/** 从 AI 回复文本中提取 JSON 画像。 */
export function parseProfileImportResponse(text: string): ProfileImportFields | null {
	const trimmed = text.trim();
	const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim();
	const candidate = fenced ?? trimmed;
	const start = candidate.indexOf("{");
	const end = candidate.lastIndexOf("}");
	if (start < 0 || end <= start) return null;

	try {
		const raw = JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
		const asList = (v: unknown): string[] | undefined => {
			if (!Array.isArray(v)) return undefined;
			return v
				.filter((x): x is string => typeof x === "string")
				.map((x) => x.trim())
				.filter((x) => x.length > 0);
		};
		const asStr = (v: unknown): string | undefined =>
			typeof v === "string" && v.trim() ? v.trim() : undefined;

		const profile: ProfileImportFields = {
			summary: asStr(raw.summary),
			role: asStr(raw.role),
			domains: asList(raw.domains),
			preferredTools: asList(raw.preferredTools),
			workPatterns: asList(raw.workPatterns),
			communicationStyle: asStr(raw.communicationStyle),
			constraints: asList(raw.constraints),
		};
		if (
			!profile.summary &&
			!profile.role &&
			!(profile.domains?.length) &&
			!(profile.workPatterns?.length)
		) {
			return null;
		}
		return profile;
	} catch {
		return null;
	}
}
