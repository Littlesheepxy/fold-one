import { useEffect, useMemo, useRef, useState } from "react";
import GridLayout, { type Layout, type LayoutItem } from "react-grid-layout/legacy";
import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
import type { HomeSnapshot } from "../types.js";
import { ConnectionIcon } from "../components/ConnectionIcon.js";
import { Card, formatTime, StatusDot } from "../components/FormFields.js";
import {
	loadOverviewLayout,
	OVERVIEW_COLS,
	OVERVIEW_ROW_HEIGHT,
	saveOverviewLayout,
	visibleOverviewWidgets,
} from "./overview-layout.js";

export function OverviewSection({
	snapshot,
	onNavigate,
}: {
	snapshot: HomeSnapshot;
	onNavigate: (section: "profile" | "work" | "tasks" | "connections" | "settings") => void;
}) {
	const recent = snapshot.episodes[0];
	const okConnections = snapshot.connections.filter((c) => c.status === "ok").length;
	const showConfigGap = !snapshot.configSummary.hasPlannerKey || !snapshot.configSummary.hasAsr;
	const visibleIds = useMemo(() => visibleOverviewWidgets(showConfigGap), [showConfigGap]);

	const containerRef = useRef<HTMLDivElement>(null);
	const [width, setWidth] = useState(960);
	const [layout, setLayout] = useState<LayoutItem[]>(() => loadOverviewLayout(visibleIds));

	useEffect(() => {
		setLayout(loadOverviewLayout(visibleIds));
	}, [visibleIds]);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const update = () => setWidth(el.clientWidth);
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	const handleLayoutChange = (next: Layout) => {
		const mutable = [...next];
		setLayout(mutable);
		saveOverviewLayout(mutable);
	};

	return (
		<div className="fold-overview">
			<p className="fold-overview-hint">拖拽标题移动卡片 · 拖拽右下角调整大小</p>
			<div ref={containerRef} className="fold-overview-grid-wrap">
				<GridLayout
					className="fold-overview-grid"
					width={width}
					layout={layout}
					cols={OVERVIEW_COLS}
					rowHeight={OVERVIEW_ROW_HEIGHT}
					margin={[14, 14] as const}
					containerPadding={[0, 0] as const}
					isDraggable
					isResizable
					compactType="vertical"
					draggableHandle=".fold-home-card-drag-handle"
					draggableCancel=".fold-home-link,button,a,input,textarea,select"
					onLayoutChange={handleLayoutChange}
					onDragStop={handleLayoutChange}
					onResizeStop={handleLayoutChange}
				>
					<div key="memory" className="fold-overview-item">
						<Card title="个人记忆" fill dragHandle>
							{recent ? (
								<>
									<p className="text-[13px] leading-relaxed text-[#3a3a3c] line-clamp-3">
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
					</div>

					<div key="tasks" className="fold-overview-item">
						<Card title="最近任务" fill dragHandle>
							{snapshot.episodes.length > 0 ? (
								<ul className="space-y-2 overflow-y-auto pr-1">
									{snapshot.episodes.slice(0, 5).map((ep) => (
										<li key={ep.id} className="truncate text-[13px] text-[#3a3a3c]">
											{ep.intent}
										</li>
									))}
								</ul>
							) : (
								<p className="text-[13px] text-[#86868b]">暂无任务记录</p>
							)}
							<button type="button" onClick={() => onNavigate("tasks")} className="fold-home-link">
								查看任务 →
							</button>
						</Card>
					</div>

					<div key="todo" className="fold-overview-item">
						<Card title="待完成" fill dragHandle>
							<p className="text-[13px] text-[#3a3a3c]">Todo 即将支持</p>
							<p className="mt-1.5 text-[11px] leading-relaxed text-[#86868b]">
								后续可从对话自动沉淀待办和下一步。
							</p>
						</Card>
					</div>

					<div key="connections" className="fold-overview-item">
						<Card title="连接状态" fill dragHandle>
							<p className="text-[13px] font-medium text-[#1d1d1f]">
								{okConnections} / {snapshot.connections.length} 项可用
							</p>
							<ul className="mt-3 space-y-2 overflow-y-auto pr-1">
								{snapshot.connections.slice(0, 5).map((c) => (
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

					{showConfigGap && (
						<div key="config-gap" className="fold-overview-item">
							<Card title="配置缺口" fill dragHandle>
								<ul className="space-y-1 text-[13px] text-[#3a3a3c]">
									{!snapshot.configSummary.hasPlannerKey && <li>· 未配置 Planner API Key</li>}
									{!snapshot.configSummary.hasAsr && <li>· 语音识别使用 Demo 模式</li>}
								</ul>
								<button type="button" onClick={() => onNavigate("settings")} className="fold-home-link">
									去设置 →
								</button>
							</Card>
						</div>
					)}
				</GridLayout>
			</div>
		</div>
	);
}
