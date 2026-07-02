import { useEffect, useState } from "react";
import { FileText, Globe, Clipboard } from "lucide-react";
import type { HomeContextEvent, HomeSnapshot } from "../types.js";
import { AppIconImg } from "../components/AppIcon.js";
import { Card } from "../components/FormFields.js";

function formatClock(ts: number) {
	return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function eventLabel(e: HomeContextEvent): { title: string; detail?: string } | null {
	switch (e.type) {
		case "app.active":
			return { title: e.data.appName ?? "未知应用", detail: e.data.windowTitle };
		case "browser.urlChanged":
			return { title: "浏览网页", detail: e.data.url };
		case "file.created":
			return {
				title: `新文件 ${e.data.filePath?.split("/").pop() ?? ""}`,
				detail: e.data.filePath,
			};
		case "clipboard.changed":
			return { title: "剪贴板更新" };
		default:
			return null;
	}
}

function TimelineIcon({ event }: { event: HomeContextEvent }) {
	if (event.type === "app.active") {
		return <AppIconImg appPath={event.data.appPath} appName={event.data.appName} size={18} />;
	}
	const cls = "h-[18px] w-[18px] shrink-0 p-0.5 text-[#aeaeb2]";
	if (event.type === "browser.urlChanged") return <Globe className={cls} strokeWidth={1.75} />;
	if (event.type === "file.created") return <FileText className={cls} strokeWidth={1.75} />;
	return <Clipboard className={cls} strokeWidth={1.75} />;
}

type Anchor = { app: string | null; window: string | null; appPath: string | null };

export function WorkTrailSection({ snapshot }: { snapshot: HomeSnapshot }) {
	const { liveContext } = snapshot;
	const [anchor, setAnchor] = useState<Anchor | null>(null);
	const [events, setEvents] = useState<HomeContextEvent[]>([]);

	useEffect(() => {
		let mounted = true;
		void window.fold.getLiveContext().then((ctx) => {
			if (!mounted) return;
			setAnchor({ app: ctx.activeApp, window: ctx.activeWindow, appPath: ctx.activeAppPath });
			setEvents([...ctx.events].reverse());
		});
		const off = window.fold.onContextEvent((event) => {
			if (event.type === "app.active") {
				setAnchor({
					app: event.data.appName ?? null,
					window: event.data.windowTitle ?? null,
					appPath: event.data.appPath ?? null,
				});
			}
			setEvents((prev) => [event, ...prev].slice(0, 50));
		});
		return () => {
			mounted = false;
			off();
		};
	}, []);

	const activeApp = anchor ? anchor.app : liveContext.activeApp;
	const activeWindow = anchor ? anchor.window : liveContext.activeWindow;

	return (
		<div className="space-y-4">
			<Card title="当前锚点">
				<div className="flex items-center gap-3">
					<div className="fold-home-icon-tile">
						<AppIconImg appPath={anchor?.appPath} appName={activeApp} size={26} />
					</div>
					<div className="min-w-0">
						<p className="text-[14px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
							{activeApp ?? "—"}
						</p>
						<p className="mt-0.5 truncate text-[12px] text-[#86868b]">
							{activeWindow ?? "无窗口信息"}
						</p>
					</div>
				</div>
			</Card>

			<Card title="操作轨迹">
				{events.length > 0 ? (
					<ul className="max-h-72 space-y-3 overflow-y-auto pr-1">
						{events.map((e) => {
							const label = eventLabel(e);
							if (!label) return null;
							return (
								<li key={e.id} className="flex items-center gap-3">
									<span className="w-11 shrink-0 text-[11px] tabular-nums text-[#aeaeb2]">
										{formatClock(e.timestamp)}
									</span>
									<TimelineIcon event={e} />
									<span className="min-w-0">
										<span className="block truncate text-[13px] text-[#1d1d1f]">{label.title}</span>
										{label.detail && (
											<span className="block truncate text-[11px] text-[#86868b]" title={label.detail}>
												{label.detail}
											</span>
										)}
									</span>
								</li>
							);
						})}
					</ul>
				) : (
					<p className="text-[13px] text-[#86868b]">暂无记录。切换应用、浏览网页后会实时出现在这里。</p>
				)}
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

		</div>
	);
}
