import type { HomeSnapshot } from "../types.js";
import { ConnectionIcon } from "../components/ConnectionIcon.js";
import { Card, formatTime, StatusDot } from "../components/FormFields.js";

export function OverviewSection({
	snapshot,
	onNavigate,
}: {
	snapshot: HomeSnapshot;
	onNavigate: (section: "profile" | "work" | "connections" | "settings") => void;
}) {
	const recent = snapshot.episodes[0];
	const okConnections = snapshot.connections.filter((c) => c.status === "ok").length;

	return (
		<div className="space-y-4">
			<div className="fold-home-grid-2">
				<Card title="个人记忆">
					{recent ? (
						<>
							<p className="text-[13px] leading-relaxed text-[#3a3a3c] line-clamp-2">
								{recent.intent}
							</p>
							<p className="mt-1.5 text-[11px] text-[#86868b]">{formatTime(recent.timestamp)}</p>
						</>
					) : (
						<p className="text-[13px] text-[#86868b]">还没有任务记录</p>
					)}
					<button type="button" onClick={() => onNavigate("profile")} className="fold-home-link">
						查看个人 →
					</button>
				</Card>

				<Card title="最近工作">
					{snapshot.episodes.length > 0 ? (
						<ul className="space-y-2">
							{snapshot.episodes.slice(0, 3).map((ep) => (
								<li key={ep.id} className="truncate text-[13px] text-[#3a3a3c]">
									{ep.intent}
								</li>
							))}
						</ul>
					) : (
						<p className="text-[13px] text-[#86868b]">暂无工作轨迹</p>
					)}
					<button type="button" onClick={() => onNavigate("work")} className="fold-home-link">
						查看轨迹 →
					</button>
				</Card>

				<Card title="待完成">
					<p className="text-[13px] text-[#3a3a3c]">Todo 即将支持</p>
					<p className="mt-1.5 text-[11px] leading-relaxed text-[#86868b]">
						后续可从对话自动沉淀待办和下一步。
					</p>
				</Card>

				<Card title="连接状态">
					<p className="text-[13px] font-medium text-[#1d1d1f]">
						{okConnections} / {snapshot.connections.length} 项可用
					</p>
					<ul className="mt-3 space-y-2">
						{snapshot.connections.slice(0, 3).map((c) => (
							<li key={c.id} className="flex items-center gap-2 text-[11px] text-[#6e6e73]">
								<ConnectionIcon id={c.id} size={14} />
								<StatusDot status={c.status} />
								<span className="truncate">{c.label}</span>
							</li>
						))}
					</ul>
					<button
						type="button"
						onClick={() => onNavigate("connections")}
						className="fold-home-link"
					>
						查看连接 →
					</button>
				</Card>
			</div>

			{(!snapshot.configSummary.hasPlannerKey || !snapshot.configSummary.hasAsr) && (
				<Card title="配置缺口">
					<ul className="space-y-1 text-[13px] text-[#3a3a3c]">
						{!snapshot.configSummary.hasPlannerKey && <li>· 未配置 Planner API Key</li>}
						{!snapshot.configSummary.hasAsr && <li>· 语音识别使用 Demo 模式</li>}
					</ul>
					<button type="button" onClick={() => onNavigate("settings")} className="fold-home-link">
						去设置 →
					</button>
				</Card>
			)}
		</div>
	);
}
