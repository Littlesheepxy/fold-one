export function normalizeFollowUpIntent(intent: string): string {
	return intent
		.replace(/^(代回|转写)：/, "")
		.replace(/[\s.。，,、…！!？?]/g, "")
		.toLocaleLowerCase("zh-CN");
}

export function dedupeFollowUpIntents<T extends { intent: string }>(items: T[], limit = 3): T[] {
	const unique = new Map<string, T>();
	for (const item of items) {
		const key = normalizeFollowUpIntent(item.intent);
		if (!key || unique.has(key)) continue;
		unique.set(key, item);
		if (unique.size >= limit) break;
	}
	return [...unique.values()];
}
