import type { HomeSnapshot } from "../types.js";
import { Card, formatTime } from "../components/FormFields.js";

export function WorkTrailSection({ snapshot }: { snapshot: HomeSnapshot }) {
	const { liveContext } = snapshot;

	return (
		<div className="space-y-4">
			<Card title="当前状态">
				<dl className="space-y-2.5 text-[13px]">
					<div className="flex gap-3">
						<dt className="w-20 shrink-0 text-[#86868b]">前台 App</dt>
						<dd className="text-[#1d1d1f]">{liveContext.activeApp ?? "—"}</dd>
					</div>
					<div className="flex gap-3">
						<dt className="w-20 shrink-0 text-[#86868b]">窗口</dt>
						<dd className="truncate text-[#1d1d1f]">{liveContext.activeWindow ?? "—"}</dd>
					</div>
				</dl>
			</Card>

			{liveContext.recentUrls.length > 0 && (
				<Card title="最近 URL">
					<ul className="space-y-2.5">
						{liveContext.recentUrls.map((u) => (
							<li
								key={u.url}
								className="truncate text-[13px] text-[#3a3a3c]"
								title={u.url}
							>
								{u.title || u.url}
							</li>
						))}
					</ul>
				</Card>
			)}

			{liveContext.recentFiles.length > 0 && (
				<Card title="最近文件">
					<ul className="space-y-2.5">
						{liveContext.recentFiles.map((f) => (
							<li
								key={f.path}
								className="truncate text-[13px] text-[#3a3a3c]"
								title={f.path}
							>
								{f.name}
							</li>
						))}
					</ul>
				</Card>
			)}

			<Card title="任务记录">
				{snapshot.episodes.length > 0 ? (
					<ul className="divide-y divide-black/5">
						{snapshot.episodes.map((ep) => (
							<li key={ep.id} className="py-3.5 first:pt-0 last:pb-0">
								<p className="text-[13px] font-medium text-[#1d1d1f]">{ep.intent}</p>
								{ep.summary && (
									<p className="mt-1 line-clamp-2 text-[13px] leading-relaxed text-[#6e6e73]">
										{ep.summary}
									</p>
								)}
								<p className="mt-1.5 text-[11px] text-[#86868b]">
									{formatTime(ep.timestamp)} · {ep.status}
								</p>
							</li>
						))}
					</ul>
				) : (
					<p className="text-[13px] text-[#86868b]">
						还没有执行记录。按 ⌥ Space 开始第一个任务。
					</p>
				)}
			</Card>
		</div>
	);
}
