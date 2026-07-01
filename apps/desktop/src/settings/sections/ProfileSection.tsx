import type { HomeSnapshot } from "../types.js";
import { Card, formatTime } from "../components/FormFields.js";

function topIntents(episodes: HomeSnapshot["episodes"], limit = 5): string[] {
	const counts = new Map<string, number>();
	for (const ep of episodes) {
		const key = ep.intent.trim().slice(0, 60);
		if (!key) continue;
		counts.set(key, (counts.get(key) ?? 0) + 1);
	}
	return [...counts.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([intent]) => intent);
}

export function ProfileSection({ snapshot }: { snapshot: HomeSnapshot }) {
	const habits = topIntents(snapshot.episodes);

	return (
		<div className="space-y-4">
			<Card title="我是谁">
				<p className="text-[13px] leading-relaxed text-[#3a3a3c]">
					Fold 通过你的任务记录和实时上下文了解你。长期记忆沉淀功能开发中。
				</p>
				{snapshot.liveContext.activeApp && (
					<p className="mt-2.5 text-[11px] text-[#86868b]">
						当前前台：{snapshot.liveContext.activeApp}
						{snapshot.liveContext.activeWindow ? ` · ${snapshot.liveContext.activeWindow}` : ""}
					</p>
				)}
			</Card>

			<Card title="我的习惯">
				{habits.length > 0 ? (
					<ul className="space-y-2.5">
						{habits.map((intent) => (
							<li key={intent} className="text-[13px] leading-relaxed text-[#3a3a3c]">
								{intent}
							</li>
						))}
					</ul>
				) : (
					<p className="text-[13px] text-[#86868b]">完成任务后，这里会归纳你常做的事。</p>
				)}
			</Card>

			<Card title="最近记忆">
				{snapshot.episodes.length > 0 ? (
					<ul className="space-y-3.5">
						{snapshot.episodes.slice(0, 5).map((ep) => (
							<li key={ep.id}>
								<p className="text-[13px] font-medium text-[#1d1d1f]">{ep.intent}</p>
								<p className="mt-1 text-[11px] text-[#86868b]">
									{formatTime(ep.timestamp)} · {ep.status}
								</p>
							</li>
						))}
					</ul>
				) : (
					<p className="text-[13px] text-[#86868b]">暂无 episodic 记忆</p>
				)}
			</Card>
		</div>
	);
}
