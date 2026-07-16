/** 从文本流提取轻量实体 token，供指纹与行为图匹配。 */
export function extractEntityTokens(...sources: Array<string | null | undefined>): string[] {
	const tokens = new Set<string>();

	for (const source of sources) {
		if (!source?.trim()) continue;
		const text = source.trim();

		for (const email of text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) ?? []) {
			tokens.add(`email:${email.toLowerCase()}`);
		}

		for (const rawUrl of text.match(/https?:\/\/[^\s<>"']+/g) ?? []) {
			try {
				const host = new URL(rawUrl).hostname.replace(/^www\./, "");
				if (host) tokens.add(`host:${host}`);
			} catch {
				// ignore
			}
		}

		for (const file of text.match(/[\w.-]+\.(pdf|docx?|xlsx?|csv|png|jpe?g)\b/gi) ?? []) {
			tokens.add(`file:${file.toLowerCase()}`);
		}

		// 飞书 / 多维表格
		if (/feishu\.cn|larkoffice\.com|多维表格|bitable/i.test(text)) {
			tokens.add("topic:feishu-bitable");
		}
		if (/baike\.baidu|百度百科/i.test(text)) {
			tokens.add("topic:baidu-baike");
		}
		if (/mail\.google|gmail|未读邮件/i.test(text)) {
			tokens.add("topic:mail");
		}
	}

	return [...tokens];
}
