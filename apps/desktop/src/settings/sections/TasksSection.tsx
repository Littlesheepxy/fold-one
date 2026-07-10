import { useEffect, useState, type ReactNode } from "react";
import {
	ArrowLeft,
	CheckCircle2,
	ChevronDown,
	Circle,
	Clipboard,
	Clock3,
	FileText,
	Globe,
	MessageCircleReply,
	Mic2,
	XCircle,
} from "lucide-react";
import { AppIconImg } from "../components/AppIcon.js";
import { Card, formatTime } from "../components/FormFields.js";
import { SkillIcon } from "../components/SkillIcon.js";
import { estimateHomeMetrics, formatSavedDuration } from "../lib/home-metrics.js";
import type { EpisodeDetail, EpisodeSummary } from "../types.js";

function formatClock(ts: number) {
	return new Date(ts).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
}

function formatDuration(ms: number) {
	if (ms < 1000) return `${ms}ms`;
	return `${(ms / 1000).toFixed(1)}s`;
}

function statusBadge(status: string) {
	const normalized = status.toLowerCase();
	if (normalized === "success") return { label: "成功", className: "fold-home-badge fold-home-badge-ok" };
	if (normalized === "partial") return { label: "部分完成", className: "fold-home-badge fold-home-badge-warn" };
	return { label: status || "失败", className: "fold-home-badge fold-home-badge-error" };
}

function StepStatusIcon({ status }: { status: string }) {
	if (status === "success") {
		return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" strokeWidth={1.75} />;
	}
	if (status === "failed") {
		return <XCircle className="h-4 w-4 shrink-0 text-red-400" strokeWidth={1.75} />;
	}
	return <Circle className="h-4 w-4 shrink-0 text-[#c7c7cc]" strokeWidth={1.75} />;
}

function contextEventLabel(event: EpisodeDetail["contextEvents"][0]) {
	switch (event.type) {
		case "app.active":
			return { title: event.data.appName ?? "未知应用", detail: event.data.windowTitle };
		case "browser.urlChanged":
			return { title: "浏览网页", detail: event.data.url };
		case "file.created":
			return {
				title: `新文件 ${event.data.filePath?.split("/").pop() ?? ""}`,
				detail: event.data.filePath,
			};
		case "clipboard.changed":
			return { title: "剪贴板更新", detail: event.data.text?.slice(0, 80) };
		default:
			return { title: event.type, detail: undefined };
	}
}

function ContextEventIcon({ event }: { event: EpisodeDetail["contextEvents"][0] }) {
	if (event.type === "app.active") {
		return <AppIconImg appPath={event.data.appPath} appName={event.data.appName} size={18} />;
	}
	const cls = "h-[18px] w-[18px] shrink-0 p-0.5 text-[#aeaeb2]";
	if (event.type === "browser.urlChanged") return <Globe className={cls} strokeWidth={1.75} />;
	if (event.type === "file.created") return <FileText className={cls} strokeWidth={1.75} />;
	return <Clipboard className={cls} strokeWidth={1.75} />;
}

/** 可折叠分区，避免详情页一屏拉太长 */
function Collapse({
	title,
	defaultOpen = false,
	children,
}: {
	title: string;
	defaultOpen?: boolean;
	children: ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);
	return (
		<div className="fold-home-card">
			<button type="button" className="fold-collapse-head" onClick={() => setOpen((o) => !o)}>
				<span>{title}</span>
				<ChevronDown
					size={15}
					strokeWidth={1.75}
					className={`fold-collapse-chevron${open ? " open" : ""}`}
				/>
			</button>
			{open && <div className="mt-3">{children}</div>}
		</div>
	);
}

function EpisodeDetailView({
	detail,
	loading,
	onBack,
}: {
	detail: EpisodeDetail | null;
	loading: boolean;
	onBack: () => void;
}) {
	return (
		<div className="space-y-4">
			<button type="button" className="fold-tasks-back" onClick={onBack}>
				<ArrowLeft size={15} strokeWidth={1.75} />
				返回任务列表
			</button>

			{loading || !detail ? (
				<Card>
					<p className="text-[13px] text-[#86868b]">{loading ? "加载任务详情…" : "未找到该任务。"}</p>
				</Card>
			) : (
				<>
					<Card>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div className="min-w-0 flex-1">
								<p className="text-[15px] font-semibold leading-snug tracking-[-0.01em] text-[#1d1d1f]">
									{detail.intent}
								</p>
								<p className="mt-1.5 text-[12px] text-[#86868b]">
									{formatTime(detail.timestamp)} · 耗时 {formatDuration(detail.durationMs)}
								</p>
							</div>
							<span className={statusBadge(detail.status).className}>
								{statusBadge(detail.status).label}
							</span>
						</div>
						{detail.summary && (
							<div className="fold-tasks-result-box mt-3.5">
								<span className="fold-tasks-result-label">结果</span>
								<p className="fold-episode-summary">{detail.summary}</p>
							</div>
						)}
					</Card>

					<Card title="执行步骤">
						{detail.steps.length > 0 ? (
							<ul className="space-y-2.5">
								{detail.steps.map((step) => (
									<li key={step.stepId} className="flex items-center gap-2.5">
										<SkillIcon skill={step.skill} />
										<div className="min-w-0 flex-1">
											<p className="text-[13px] text-[#1d1d1f]">{step.label}</p>
											{step.error && (
												<p className="mt-0.5 truncate text-[11px] text-[#d97706]" title={step.error}>
													{step.error}
												</p>
											)}
										</div>
										<span className="shrink-0 text-[11px] tabular-nums text-[#aeaeb2]">
											{formatDuration(step.durationMs)}
										</span>
										<StepStatusIcon status={step.status} />
									</li>
								))}
							</ul>
						) : (
							<p className="text-[13px] text-[#86868b]">无步骤记录</p>
						)}
					</Card>

					{detail.resultDetail && detail.resultDetail !== detail.summary && (
						<Collapse title="结果详情">
							<pre className="fold-episode-pre">{detail.resultDetail}</pre>
						</Collapse>
					)}

					<Collapse title="分析与计划">
						<pre className="fold-episode-pre">{detail.thinkingText}</pre>
					</Collapse>

					{detail.contextEvents.length > 0 && (
						<Collapse title={`任务上下文（${detail.contextEvents.length}）`}>
							<ul className="max-h-64 space-y-3 overflow-y-auto pr-1">
								{[...detail.contextEvents].reverse().map((event) => {
									const label = contextEventLabel(event);
									return (
										<li key={event.id} className="flex items-center gap-3">
											<span className="w-11 shrink-0 text-[11px] tabular-nums text-[#aeaeb2]">
												{formatClock(event.timestamp)}
											</span>
											<ContextEventIcon event={event} />
											<span className="min-w-0">
												<span className="block truncate text-[13px] text-[#1d1d1f]">
													{label.title}
												</span>
												{label.detail && (
													<span
														className="block truncate text-[11px] text-[#86868b]"
														title={label.detail}
													>
														{label.detail}
													</span>
												)}
											</span>
										</li>
									);
								})}
							</ul>
						</Collapse>
					)}

					{detail.probeSummary && (
						<Collapse title="环境探测">
							<pre className="fold-episode-pre">{detail.probeSummary}</pre>
						</Collapse>
					)}

					{detail.validationChecks.length > 0 && (
						<Collapse title="校验">
							<ul className="space-y-2">
								{detail.validationChecks.map((check) => (
									<li
										key={check.rule}
										className="flex items-center gap-2 text-[13px] text-[#3a3a3c]"
									>
										<StepStatusIcon status={check.passed ? "success" : "failed"} />
										<span>
											{check.rule}
											{check.message ? ` — ${check.message}` : ""}
										</span>
									</li>
								))}
							</ul>
						</Collapse>
					)}
				</>
			)}
		</div>
	);
}

function TaskEpisodeCard({ ep, onClick }: { ep: EpisodeSummary; onClick: () => void }) {
	const badge = statusBadge(ep.status);
	const steps = ep.steps ?? [];
	const apps = ep.apps ?? [];
	const previewSteps = steps.slice(0, 4);
	const extraSteps = steps.length - previewSteps.length;

	return (
		<button type="button" onClick={onClick} className="fold-tasks-card">
			<div className="fold-tasks-card-head">
				<span className={badge.className}>{badge.label}</span>
				<span className="fold-tasks-card-meta">
					{formatTime(ep.timestamp)}
					{ep.durationMs > 0 && ` · ${formatDuration(ep.durationMs)}`}
				</span>
			</div>

			<p className="fold-tasks-card-intent">{ep.intent}</p>

			{ep.summary && (
				<div className="fold-tasks-result-box">
					<span className="fold-tasks-result-label">结果</span>
					<p className="fold-tasks-result-text">{ep.summary}</p>
				</div>
			)}

			{previewSteps.length > 0 && (
				<div className="fold-tasks-card-section">
					<span className="fold-tasks-section-label">
						执行 {ep.stepCount ?? steps.length} 步
						{(ep.successCount ?? 0) > 0 && ` · ${ep.successCount} 成功`}
					</span>
					<div className="fold-tasks-step-chips">
						{previewSteps.map((step, i) => (
							<span
								key={step.stepId ?? `${step.skill}-${i}`}
								className={`fold-tasks-step-chip${step.status === "failed" ? " failed" : ""}`}
								title={step.label}
							>
								<SkillIcon skill={step.skill} size={13} />
								<span className="truncate">{step.label}</span>
							</span>
						))}
						{extraSteps > 0 && <span className="fold-tasks-step-more">+{extraSteps}</span>}
					</div>
				</div>
			)}

			{apps.length > 0 && (
				<div className="fold-tasks-card-section">
					<span className="fold-tasks-section-label">涉及应用</span>
					<div className="fold-tasks-app-row">
						{apps.slice(0, 4).map((app) => (
							<span key={app.name} className="fold-tasks-app-chip" title={app.name}>
								<AppIconImg appPath={app.path} appName={app.name} size={16} />
								<span className="truncate">{app.name}</span>
							</span>
						))}
					</div>
				</div>
			)}
		</button>
	);
}

export function TasksSection({
	active,
	focusEpisodeId,
	onFocusConsumed,
}: {
	active: boolean;
	focusEpisodeId?: string | null;
	onFocusConsumed?: () => void;
}) {
	const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [detail, setDetail] = useState<EpisodeDetail | null>(null);
	const [loadingList, setLoadingList] = useState(true);
	const [loadingDetail, setLoadingDetail] = useState(false);

	useEffect(() => {
		if (!active) return;
		let mounted = true;
		setLoadingList(true);
		void window.fold
			.listEpisodes()
			.then((items) => {
				if (!mounted) return;
				setEpisodes(items);
				if (focusEpisodeId && items.some((item) => item.id === focusEpisodeId)) {
					setSelectedId(focusEpisodeId);
					onFocusConsumed?.();
				}
			})
			.finally(() => {
				if (mounted) setLoadingList(false);
			});
		return () => {
			mounted = false;
		};
	}, [active, focusEpisodeId, onFocusConsumed]);

	useEffect(() => {
		if (!selectedId) {
			setDetail(null);
			return;
		}
		let mounted = true;
		setLoadingDetail(true);
		void window.fold.getEpisode(selectedId).then((data) => {
			if (!mounted) return;
			setDetail(data);
			setLoadingDetail(false);
		});
		return () => {
			mounted = false;
		};
	}, [selectedId]);

	if (selectedId) {
		return (
			<EpisodeDetailView
				detail={detail}
				loading={loadingDetail}
				onBack={() => setSelectedId(null)}
			/>
		);
	}

	return (
		<div className="fold-tasks-page">
			<div className="fold-tasks-page-head">
				<h2 className="text-[15px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">活动</h2>
				<span className="text-[11px] text-[#aeaeb2]">{episodes.length} 条</span>
			</div>

			{episodes.length > 0 ? (
				<section className="fold-tasks-stats" aria-label="本周统计">
					{(() => {
						const metrics = estimateHomeMetrics(episodes);
						return (
							<>
								<div className="fold-tasks-stat">
									<Mic2 size={16} strokeWidth={1.8} />
									<span>字数</span>
									<strong>{metrics.characters.toLocaleString("zh-CN")}</strong>
								</div>
								<div className="fold-tasks-stat">
									<MessageCircleReply size={16} strokeWidth={1.8} />
									<span>回复</span>
									<strong>{metrics.replies}</strong>
								</div>
								<div className="fold-tasks-stat">
									<CheckCircle2 size={16} strokeWidth={1.8} />
									<span>行动</span>
									<strong>{metrics.actions}</strong>
								</div>
								<div className="fold-tasks-stat is-highlight">
									<Clock3 size={16} strokeWidth={1.8} />
									<span>节省</span>
									<strong>{formatSavedDuration(metrics.savedMinutes)}</strong>
								</div>
							</>
						);
					})()}
				</section>
			) : null}

			{loadingList ? (
				<p className="text-[13px] text-[#86868b]">加载中…</p>
			) : episodes.length > 0 ? (
				<div className="fold-tasks-grid">
					{episodes.map((ep) => (
						<TaskEpisodeCard key={ep.id} ep={ep} onClick={() => setSelectedId(ep.id)} />
					))}
				</div>
			) : (
				<Card>
					<p className="text-[13px] text-[#86868b]">还没有执行记录。按 ⌥Space 开始第一个任务。</p>
				</Card>
			)}
		</div>
	);
}
