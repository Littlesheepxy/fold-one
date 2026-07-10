import { useEffect, useState } from "react";
import { FileText, Globe, Clipboard } from "lucide-react";
import type { HomeContextEvent, HomeSnapshot, LiveContextLite } from "../types.js";
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
		case "file.modified":
			return {
				title: `编辑文件 ${e.data.filePath?.split("/").pop() ?? ""}`,
				detail: e.data.filePath,
			};
		case "clipboard.changed": {
			const preview = e.data.text?.trim();
			return {
				title: "剪贴板更新",
				detail: preview
					? preview.slice(0, 60) + (preview.length > 60 ? "…" : "")
					: undefined,
			};
		}
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
	if (event.type === "file.created" || event.type === "file.modified") {
		return <FileText className={cls} strokeWidth={1.75} />;
	}
	return <Clipboard className={cls} strokeWidth={1.75} />;
}

function formatDwell(ms: number): string {
	const min = Math.round(ms / 60_000);
	if (min < 1) return "不到 1 分钟";
	if (min < 60) return `约 ${min} 分钟`;
	return `约 ${Math.round(min / 60)} 小时`;
}

type Anchor = { app: string | null; window: string | null; appPath: string | null };
type FocusDwellLite = { app: string; windowTitle?: string; dwellMs: number };

export function WorkTrailSection({ snapshot }: { snapshot: HomeSnapshot }) {
	const { liveContext } = snapshot;
	const [anchor, setAnchor] = useState<Anchor | null>(null);
	const [events, setEvents] = useState<HomeContextEvent[]>([]);
	const [recentFiles, setRecentFiles] = useState(liveContext.recentFiles);
	const [recentUrls, setRecentUrls] = useState(liveContext.recentUrls);
	const [focusDwells, setFocusDwells] = useState<FocusDwellLite[]>([]);

	useEffect(() => {
		let mounted = true;
		const apply = (ctx: LiveContextLite) => {
			setAnchor({ app: ctx.activeApp, window: ctx.activeWindow, appPath: ctx.activeAppPath });
			setEvents([...ctx.events].reverse());
			setRecentFiles(ctx.recentFiles ?? []);
			setRecentUrls(ctx.recentUrls ?? []);
			setFocusDwells(ctx.focusDwells ?? []);
		};
		void window.fold.getLiveContext().then((ctx) => {
			if (!mounted) return;
			apply(ctx);
		});
		const off = window.fold.onContextEvent((event) => {
			if (event.type === "app.active") {
				setAnchor({
					app: event.data.appName ?? null,
					window: event.data.windowTitle ?? null,
					appPath: event.data.appPath ?? null,
				});
			}
			if (event.type === "file.created" || event.type === "file.modified") {
				const path = event.data.filePath;
				if (path) {
					const name = path.split("/").pop() ?? path;
					setRecentFiles((prev) => [{ path, name }, ...prev.filter((f) => f.path !== path)].slice(0, 10));
				}
			}
			setEvents((prev) => [event, ...prev].slice(0, 80));
		});
		return () => {
			mounted = false;
			off();
		};
	}, []);

	const activeApp = anchor ? anchor.app : liveContext.activeApp;
	const activeWindow = anchor ? anchor.window : liveContext.activeWindow;

	return (
		<div className="space-y-5">
			<div>
				<h1 className="fold-home-page-title">轨迹</h1>
				<p className="fold-home-page-subtitle">实时操作记录与应用上下文（重启后保留近 4 小时）</p>
			</div>

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

			{focusDwells.length > 0 && (
				<Card title="停留较久">
					<ul className="space-y-2.5">
						{focusDwells.map((d) => {
							const label = d.windowTitle ? `${d.app} · ${d.windowTitle}` : d.app;
							return (
								<li key={`${d.app}-${d.windowTitle ?? ""}`} className="text-[13px] text-[#3a3a3c]">
									<span className="text-[#1d1d1f]">{label}</span>
									<span className="text-[#86868b]"> · {formatDwell(d.dwellMs)}</span>
								</li>
							);
						})}
					</ul>
				</Card>
			)}

			{recentUrls.length > 0 && (
				<Card title="最近 URL">
					<ul className="space-y-2.5">
						{recentUrls.map((u) => (
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

			{recentFiles.length > 0 && (
				<Card title="最近文件">
					<ul className="space-y-2.5">
						{recentFiles.map((f) => (
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
