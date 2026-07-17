/** Task-shape keys for recipe clustering — pure string rules, no DB. */

export function clusterKeyFromSkills(skills: string[]): string {
	return skills.filter(Boolean).join(">");
}

/** Normalize intent into comparable tokens (CJK bigrams + latin words). */
export function normalizeIntentTokens(intent: string): string[] {
	const lower = intent.toLowerCase();
	const tokens = new Set<string>();
	for (const m of lower.matchAll(/[a-z0-9_]{2,}/g)) tokens.add(m[0]);
	const cjk = lower.replace(/[^\u4e00-\u9fff]/g, "");
	for (let i = 0; i < cjk.length - 1; i++) tokens.add(cjk.slice(i, i + 2));
	for (const tip of [
		"飞书",
		"钉钉",
		"企微",
		"邮件",
		"草稿",
		"日程",
		"日历",
		"上传",
		"自己",
		"消息",
		"报价",
		"剪贴板",
		"桌面",
	]) {
		if (intent.includes(tip)) tokens.add(tip);
	}
	return [...tokens].sort();
}

export function jaccard(a: string[], b: string[]): number {
	if (a.length === 0 && b.length === 0) return 1;
	const as = new Set(a);
	const bs = new Set(b);
	let inter = 0;
	for (const t of as) if (bs.has(t)) inter++;
	return inter / (as.size + bs.size - inter);
}

/**
 * L1×L2 task class: "{domain}.{action}".
 * Rules only — mirrors capability-resolver intent hints without importing runtime.
 */
export function classifyTaskClass(intent: string, skills?: string[]): string {
	const domain = classifyDomain(intent);
	const action = classifyAction(intent, skills);
	return `${domain}.${action}`;
}

function classifyDomain(intent: string): string {
	if (/(钉钉|dingtalk)/i.test(intent)) return "dingtalk";
	if (/(企微|企业微信|wecom|wechat\s*work)/i.test(intent)) return "wecom";
	if (/(飞书|feishu|lark)/i.test(intent)) {
		if (/(邮件|mail|邮箱)/i.test(intent)) return "mail";
		return "feishu";
	}
	if (/(邮件|mail|gmail|草稿|邮箱|outlook|苹果邮件)/i.test(intent)) return "mail";
	if (/(日历|日程|会议|calendar)/i.test(intent)) return "calendar";
	if (/(剪贴板|clipboard|刚才.{0,6}复制)/i.test(intent)) return "clipboard";
	if (/(浏览器|网页|chrome|browser)/i.test(intent)) return "browser";
	if (/(pdf|下载|桌面|文件|报价)/i.test(intent)) return "files";
	return "other";
}

function classifyAction(intent: string, skills?: string[]): string {
	if (/(我自己|自己|本人)/.test(intent) && /(发|发送|消息)/.test(intent)) return "send_self";
	if (/(发给|发送给|发消息给)/.test(intent)) return "send_other";
	if (/(上传|云空间|drive)/i.test(intent)) return "upload";
	if (/(日程|日历|会议).{0,12}(创建|建|加)/.test(intent) || /创建.{0,8}(日程|日历|会议)/.test(intent))
		return "create_event";
	if (/(草稿|draft)/i.test(intent)) return "draft_mail";
	if (/(未读|多少封|几封|count.*mail|mail.*count)/i.test(intent)) return "count_mail";
	if (/(剪贴板|clipboard|刚才.{0,6}复制)/i.test(intent)) return "recall_clipboard";
	if (/(读|看|金额|提取).{0,12}(pdf|报价|文件)/i.test(intent) || /pdf.{0,12}(读|金额|提取)/i.test(intent))
		return "read_pdf";
	if (/(打开|open)/i.test(intent)) return "open";

	const sig = skills?.join(",") ?? "";
	if (/mail\.draft/.test(sig)) return "draft_mail";
	if (/mail\.countUnread/.test(sig)) return "count_mail";
	if (/clipboard\.recall/.test(sig)) return "recall_clipboard";
	if (/pdf\.extract|finder\.latestDownload/.test(sig)) return "read_pdf";
	if (/office\.cli/.test(sig) && /calendar|日程/.test(intent)) return "create_event";
	if (/office\.cli/.test(sig) && /(发|消息|im)/.test(intent)) {
		return /(我自己|自己|本人)/.test(intent) ? "send_self" : "send_other";
	}
	return "other";
}
