import { listRecentEpisodes, type Episode } from "@fold/memory";

function isRelevant(intent: string, episode: Episode): boolean {
	const normalized = intent.toLowerCase();
	if (episode.intent && normalized.includes(episode.intent.slice(0, 8).toLowerCase())) {
		return true;
	}
	const topics = [
		{ re: /(邮件|mail|未读|待处理)/i, match: /(mail|邮件|未读|待处理)/i },
		{ re: /(download|下载|pdf)/i, match: /(pdf|download|下载|shell)/i },
	];
	for (const topic of topics) {
		if (topic.re.test(intent) && topic.match.test(`${episode.intent} ${episode.summary}`)) {
			return true;
		}
	}
	return false;
}

export function formatRelevantEpisodes(intent: string, dataDir?: string, limit = 3): string {
	const episodes = listRecentEpisodes(8, dataDir).filter((e) => isRelevant(intent, e)).slice(0, limit);
	if (!episodes.length) return "";
	return episodes
		.map((e) => `- ${e.intent} → ${e.summary} (${e.status}, ${new Date(e.timestamp).toISOString()})`)
		.join("\n");
}
