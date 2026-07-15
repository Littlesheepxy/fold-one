import type { Episode } from "@fold/memory";

export interface ProfileImportFields {
	summary?: string;
	role?: string;
	domains?: string[];
	preferredTools?: string[];
	workPatterns?: string[];
	communicationStyle?: string;
	constraints?: string[];
	/** 完整三层协作上下文档案（Markdown），供迁移到其他 AI 或本地留存 */
	migrationArchive?: string;
}

function episodeLine(ep: Episode): string {
	const status = ep.status || "unknown";
	const summary = ep.summary?.trim() || ep.goal?.trim() || "";
	return `- [${status}] ${ep.intent.trim()}${summary ? ` → ${summary.slice(0, 120)}` : ""}`;
}

function buildMigrationPromptCore(taskBlock: string): string {
	return `请基于你当前能访问到的、与我相关的长期记忆、历史会话信息以及近期会话上下文，整理一份「三层用户协作上下文档案」。

目标不是生成普通个人简介，而是让我把这份内容迁移到其他 AI 工具后，新 AI 能快速恢复与我的长期协作体验，并理解：

* 我是谁；
* 我通常如何工作和思考；
* 我长期参与哪些项目；
* 我近期在处理哪些事件、事项或对话线程；
* 我最近正在做什么、做到哪一步。

请将所有信息拆分为以下三层：

# 第一层：User Profile｜长期用户画像

这一层只记录相对稳定、跨项目长期有效的信息。

包括：

* 身份
* 教育背景
* 职业经历
* 当前职业身份
* 核心能力领域
* 我明确要求 AI 长期遵循的协作规则
* 稳定的工作习惯
* 稳定的沟通偏好
* 稳定的写作偏好
* 稳定的产品判断方式
* 长期反复出现的思维模型
* 稳定的审美偏好

判断标准：

一条信息只有在满足以下条件之一时，才应该进入 User Profile：

1. 我明确表示这是长期要求或长期偏好；
2. 我在多个不同任务中反复表现出相同习惯；
3. 该信息即使换一个项目，仍然大概率成立；
4. 该信息预计 3 个月后仍然有效。

不要因为一次具体任务中的要求，就自动上升为长期偏好。

例如：

* “本周工作思考不要写得像研报”如果我只在一个任务中提出，不一定是全局偏好；
* 但如果我在多个写作任务中反复要求“自然、真实、不要宏大叙事”，可以总结为稳定写作偏好。

User Profile 按以下分类输出：

* Instructions
* Identity
* Career
* Work Patterns
* Beliefs & Mental Models
* Preferences & Taste

Instructions 中须尽量覆盖：哪些事可自动执行、哪些必须经我确认；常用工具/渠道；回答语言与格式偏好（如结论先行、简体中文等）。

---

# 第二层：Project & Matter Context｜项目与持续事项上下文

这一层保存**有连续性、未来仍可能继续引用**的信息，既包括项目，也包括**持续事项、事件线、对话线程**等——不一定都叫「项目」。

### 什么应进入这一层

**项目（Project）**：我实际参与、持续构建、持续研究或持续投入精力的事项。

**持续事项 / 事件线（Matter / Event Thread）**：不是完整项目，但有明确主题、跨多次对话推进、未来几周至几个月内仍可能需要继续跟进。例如：

* 分公司设立沟通与材料准备
* 某次融资/合作谈判
* 人员招聘或组织调整
* 一次出行、活动、会议筹备
* 某段重要对话的跟进（如与某人约周一开会）

**不要进入这一层**：

* 一次性、问完即结束的咨询（除非结论对未来仍有参考价值，可简短记入相关项目/事项的 Milestones）
* 纯当下状态、几天内就会变化的内容（应放 Active Context）

每个条目单独建立一个 Context Block。字段名仍用 Project Name，但若是事件/事项，可写事件名或线程名。

每个条目包含：

## Project Name

项目名 / 事项名 / 事件名 / 对话线程名

## Entry Type

project / matter / event / thread

## Project Type

（Entry Type 为 project 时填写）
工作项目 / 创业项目 / 产品项目 / 投资项目 / 研究项目 / 个人事项

## Matter Type

（Entry Type 为 matter / event / thread 时填写）
组织事务 / 商务谈判 / 招聘人事 / 会议活动 / 对话跟进 / 合规法务 / 个人事项 / 其他

## Overview

这件事是做什么的、因何而起。

## My Role

我在其中的角色和实际参与程度。

## Current Status

当前阶段（进行中 / 等待对方 / 已暂停 / closed）。

## Key Decisions

已经明确确认的重要决策。

## Rejected Directions

已经明确否定、放弃或认为不适合的方向。

## Working Assumptions

当前仍在使用、但未来可能变化的判断或假设。

## Open Questions

目前尚未解决的问题。

## Milestones / History

按时间顺序记录关键进展。

## Project-specific Preferences

只适用于该条目（项目/事项/事件）的偏好、规则或设计要求。

重要规则：

* 条目专属要求不要写进 User Profile。
* 已结束的事项也可以保留，但标记 status: closed。
* 方向发生变化时，要保留关键变化历史。
* 不要把旧状态当作当前状态。
* 如果同一件事有多个名称，尽量合并，并注明曾用名。
* **不要把所有事件都硬升格为项目**；持续数周以上的事项线用 matter/event，纯近期推进用 Active Context。

判断标准：

如果一条信息满足以下特征，应进入 Project & Matter Context：

1. 只在某一个项目/事项/事件线中成立；
2. 换一个主题就不一定成立；
3. 是该主题的历史、关键决策、方向变化或未解决问题；
4. 即使不是最近 30 天的信息，未来继续处理该主题时仍然有价值。

---

# 第三层：Active Context｜近期上下文

这一层只记录最近正在发生、仍需要继续跟进的信息。

重点关注最近 30 天；如果某件事虽超过 30 天，但仍处于活跃推进状态，也可以保留。

每条 Active Context 应包含：

## Topic

事项名称。

## Topic Type

project / event / matter / thread / personal

## Related Project or Matter

关联的项目或持续事项；如果没有明确归属，写 none。

## Current Situation

当前正在做什么。

## Last Confirmed State

最近一次确认到哪一步。

## Recent Decisions

近期刚确认的结论。

## Current Friction / Concern

当前纠结、卡点、担忧或未解决问题。

## Likely Next Step

根据现有上下文，下一步最可能继续处理什么。

## Last Updated

最后更新时间。

Active Context 判断标准：

如果一条信息预计在未来几天到几周内会变化，应优先放在 Active Context。

**事件与项目的分界**：

* 持续数周以上、会形成「历史与决策积累」的 → 第二层建 matter/event 条目，Active Context 只写最新状态；
* 纯近期、一次性、或尚未形成事项线的 → 只放 Active Context，Topic Type 用 event / personal 等；
* 属于某个项目/事项线的当下进展 → Related Project or Matter 填归属，避免与第二层重复堆砌。

例如：

* “Fold 是 macOS 语音 + Agent 工具”属于 Project & Matter Context（Entry Type: project）；
* “分公司设立沟通群”若持续多轮推进，属于 matter/event 条目；若只是本周约会议，可仅放 Active Context；
* “Fold Logo 当前正在四角星、云雾渐变方向继续细化”属于 Active Context；
* “我偏好 AI 回答结论先行”属于 User Profile。

---

# 信息分层原则

在整理每条信息前，先进行以下判断：

第一问：
这条信息换一个项目/主题后仍然成立吗？

* 是 → 优先考虑 User Profile
* 否 → 继续判断

第二问：
这条信息是否属于某个持续项目、事项线或事件线的历史、决策或长期状态？

* 是 → Project & Matter Context
* 否 → 继续判断

第三问：
这条信息是否属于最近正在推进、短期可能变化的状态？

* 是 → Active Context

如果一条信息同时影响多个层级，可以拆开表达，但不要机械重复。

例如：

原始信息：
“Fold 当前 Logo 偏好白底、四角星、云雾渐变。”

可以拆为：

User Profile：
“在产品视觉设计中，用户整体偏好简洁、现代、克制，重视辨识度和细节一致性。”

Project Context / Fold：
“Fold Logo 已确定四角星作为核心识别方向，偏好云雾渐变，明确不希望直接复制 Codex 配色。”

Active Context：
“Fold Logo 当前仍在调整四角弧度、大小一致性和内部白色自然过渡。”

原始信息（事件示例）：
“和谭逸约周一开会，讨论分公司设立进度。”

可以拆为：

Project & Matter Context / 分公司设立（matter）：
“分公司设立是多轮沟通事项，涉及沟通群与材料准备。”

Active Context（event）：
“Topic: 与谭逸周一会议；Likely Next Step: 确认议程与需同步的设立进度。”

禁止因为同一原始信息涉及三个层级，就直接复制三遍原句。

---

# 来源和置信度

每条重要信息尽量补充以下字段：

date: YYYY-MM-DD / unknown
source_type: explicit / inferred
confidence: high / medium
stability: long_term / project / matter / active

字段定义：

explicit：
我明确说过、要求过、确认过。

inferred：
基于多次对话形成的稳定总结。

high：
有明确直接证据，或多次重复出现。

medium：
有一定依据，但仍可能存在范围限制。

禁止输出 low confidence 信息。

---

# 时间与冲突处理

如果同一信息在不同时间存在冲突：

1. 优先使用更新时间更近的信息；
2. 不要直接覆盖掉重要历史变化；
3. 在 Project & Matter Context 中记录方向变化；
4. 在 User Profile 中只保留当前仍稳定成立的信息；
5. 在 Active Context 中只保留当前最新状态。

例如：

2026-01：用户考虑 A 方向。
2026-03：用户明确否定 A，转向 B。

应记录：

* Project & Matter Context：曾考虑 A，后明确否定，转向 B。
* Active Context：当前推进 B。
* 不应在 User Profile 中写“用户偏好 A”。

---

# 输出格式

请严格按以下顺序输出：

# User Profile

## Instructions

[date] - 内容
source_type:
confidence:
stability:

## Identity

...

## Career

...

## Work Patterns

...

## Beliefs & Mental Models

...

## Preferences & Taste

...

# Project & Matter Context

## 条目名称

Entry Type:
Matter Type:（如适用）
Status:

### Overview

...

### My Role

...

### Current Status

...

### Key Decisions

...

### Rejected Directions

...

### Working Assumptions

...

### Open Questions

...

### Milestones / History

[date] - ...

### Project-specific Preferences

...

依次输出所有明确存在的持续项目、事项线与事件线。

# Active Context

## 事项名称

Topic Type:
Related Project or Matter:
Last Updated:

### Current Situation

...

### Last Confirmed State

...

### Recent Decisions

...

### Current Friction / Concern

...

### Likely Next Step

...

---

最后额外输出：

# Context Maintenance Suggestions

分为：

## 建议长期保留

列出最值得长期迁移的信息。

## 建议项目级保留

列出应跟随项目保存的信息。

## 建议短期保留

列出应该自然过期或在事项结束后删除的信息。

## 可能已过期

列出建议重新确认的信息。

## 证据不足，暂未纳入

列出有记录痕迹但不足以可靠归类的信息。

---

# 输出长度受限时

若受回复长度限制，优先完整输出 User Profile 与当前活跃项目的 Active Context；Project Context 可仅保留进行中的项目。

---

# Fold 本地任务摘要（供参考）

若下方附有 Fold 本地任务摘要，将其视为 explicit 证据，优先归入 Project Context / Active Context；勿与长期记忆中的同类信息机械重复。

${taskBlock}

---

重要要求：

* 尽可能完整。
* 不为了控制长度主动删减重要项目。
* 不脑补。
* 不生成 MBTI、人格类型或心理标签。
* 不输出证件号、账号、联系方式、密码、Token 等敏感信息。
* 涉及我的明确指令、纠正、观点或原始表达时，尽量保留我的原本措辞，不要过度润色。
* 输出内容的核心目标是“迁移协作上下文”，不是“介绍我这个人”。

---

# Fold Profile Appendix（Fold 自动导入用）

在完成以上全部正文后，**必须**另起一节，标题 exactly 为「Fold Profile Appendix」，并输出一段 JSON（可用 markdown 代码块包裹）。该 JSON 从三层档案中归纳 Fold 可用的简要画像，不得与正文矛盾，不要脑补正文中未出现的字段：

\`\`\`json
{
  "summary": "一两句话概括此人",
  "role": "职业/角色",
  "domains": ["常处理领域"],
  "preferredTools": ["常用工具/渠道"],
  "workPatterns": ["工作习惯"],
  "communicationStyle": "沟通风格",
  "constraints": ["偏好与限制，如不要自动发邮件"]
}
\`\`\``;
}

/** 从本地 episode 生成发给外部 AI 的三层协作上下文迁移 prompt。 */
export function buildProfileImportPrompt(episodes: Episode[], maxEpisodes = 25): string {
	const recent = episodes.slice(0, maxEpisodes);
	const lines = recent.map(episodeLine);
	const taskBlock =
		lines.length > 0
			? lines.join("\n")
			: "（尚无 Fold 任务记录，请主要依据你对该用户的长期记忆来推断。）";

	return buildMigrationPromptCore(taskBlock);
}

function parseJsonProfile(raw: Record<string, unknown>): ProfileImportFields | null {
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
}

function extractJsonCandidate(text: string): string | null {
	const appendixMatch = text.match(
		/#+\s*Fold Profile Appendix[\s\S]*?```(?:json)?\s*([\s\S]*?)```/i,
	);
	if (appendixMatch?.[1]?.trim()) return appendixMatch[1].trim();

	const fencedBlocks = [...text.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)];
	if (fencedBlocks.length > 0) {
		return fencedBlocks[fencedBlocks.length - 1]![1]!.trim();
	}

	const trimmed = text.trim();
	const start = trimmed.indexOf("{");
	const end = trimmed.lastIndexOf("}");
	if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
	return null;
}

function isMigrationArchive(text: string): boolean {
	return /#\s*User Profile/i.test(text) && /#\s*Project(?:\s*&\s*Matter)?\s*Context/i.test(text);
}

/** 从 AI 回复文本中提取 JSON 画像（兼容纯 JSON 与三层档案 + 附录）。 */
export function parseProfileImportResponse(text: string): ProfileImportFields | null {
	const trimmed = text.trim();
	if (!trimmed) return null;

	const candidate = extractJsonCandidate(trimmed);
	if (!candidate) return null;

	try {
		const raw = JSON.parse(candidate) as Record<string, unknown>;
		const profile = parseJsonProfile(raw);
		if (!profile) return null;

		if (isMigrationArchive(trimmed)) {
			profile.migrationArchive = trimmed;
		}
		return profile;
	} catch {
		return null;
	}
}
