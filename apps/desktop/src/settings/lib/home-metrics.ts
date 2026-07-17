import type { HomeEpisode } from "../types.js";

const REPLY_HINT = /回复|reply|邮件|mail|微信|消息/i;

export function startOfWeek() {
	const now = new Date();
	const day = now.getDay() || 7;
	now.setHours(0, 0, 0, 0);
	now.setDate(now.getDate() - day + 1);
	return now.getTime();
}

export function estimateHomeMetrics(episodes: Array<Pick<HomeEpisode, "intent" | "summary" | "status" | "timestamp">>) {
	const weekly = episodes.filter((episode) => episode.timestamp >= startOfWeek());
	const characters = weekly.reduce(
		(total, episode) => total + episode.intent.length + episode.summary.length,
		0,
	);
	const replies = weekly.filter((episode) => REPLY_HINT.test(episode.intent)).length;
	const actions = weekly.filter((episode) => episode.status === "success" || episode.status === "recovered").length;
	const savedMinutes = Math.max(actions * 8 + replies * 3, characters ? 4 : 0);
	return { characters, replies, actions, savedMinutes };
}

export function formatSavedDuration(minutes: number) {
	if (minutes < 60) return `${minutes} 分钟`;
	const hours = Math.floor(minutes / 60);
	const rest = minutes % 60;
	return rest ? `${hours} 小时 ${rest} 分钟` : `${hours} 小时`;
}
