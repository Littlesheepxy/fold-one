/**
 * WorkBuddy 工具名 × 意图粗匹配。
 * 有明确域词时必须和工具名有重叠；wb_run 等开放执行器视为万能。
 * toolNames 为空时保守放行（与旧行为一致）。
 */
const OPEN_RUNNERS = new Set(["wb_run", "wb_search", "wb_advance"]);

const DOMAIN_NEEDLES: Array<{ re: RegExp; needles: string[] }> = [
	{
		re: /obsidian|vault|笔记同步|知识库/i,
		needles: ["obsidian", "vault", "note", "笔记", "notion", "knowledge"],
	},
	{
		re: /ardot|设计稿|设计文件|canvas|figma/i,
		needles: ["ardot", "design", "canvas", "figma", "layout"],
	},
	{
		re: /待办|todo|日程同步|calendar.?sync/i,
		needles: ["todo", "task", "calendar", "待办", "automation"],
	},
	{
		re: /部署|deploy|静态站|cloudstudio/i,
		needles: ["deploy", "cloudstudio", "static"],
	},
];

export function workbuddyToolsFitIntent(intent: string, toolNames: readonly string[]): boolean {
	if (/workbuddy/i.test(intent)) return true;
	if (toolNames.length === 0) return true;
	if (toolNames.some((name) => OPEN_RUNNERS.has(name))) return true;

	const blob = toolNames.join(" ").toLowerCase();
	for (const domain of DOMAIN_NEEDLES) {
		if (!domain.re.test(intent)) continue;
		return domain.needles.some((needle) => blob.includes(needle.toLowerCase()));
	}

	// 无明确域词：有非闲聊工具即可（避免只有 conversation_search 时乱分流）
	const actionable = toolNames.filter(
		(name) => !/^(conversation_search|read_me|show_widget|present_files)$/i.test(name),
	);
	return actionable.length > 0;
}
