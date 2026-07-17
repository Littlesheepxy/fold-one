import { useEffect, useRef, useState } from "react";
import {
	ArrowRight,
	Check,
	CheckCircle2,
	Clock3,
	MessageCircleReply,
	Mic2,
	RefreshCw,
	Repeat2,
	ChevronDown,
	Sparkles,
	WandSparkles,
	X,
} from "lucide-react";
import type { ClipboardHistoryItem, HomeAhaGuess, HomeEpisode, HomeSnapshot, LiveContextLite } from "../types.js";
import { buildContextTargets, type ContextTarget } from "../lib/context-targets.js";
import { estimateHomeMetrics, formatSavedDuration } from "../lib/home-metrics.js";
import { ContextTargetChip } from "../components/ContextTargetChip.js";
import { TAGLINE, TAGLINE_FOOT, TAGLINE_LEAD } from "../../brand/constants.js";
import { offerClipboardRecovery } from "../../lib/clipboard-offer.js";

const REPLY_HINT = /回复|reply|邮件|mail|微信|消息/i;
const REWRITE_HINT = /改写|整理|总结|润色|rewrite|summary/i;
const ACTION_HINT = /创建|提醒|待办|日程|发送|交给|完成|codex|claude/i;

function formatActivityTime(timestamp: number) {
	const date = new Date(timestamp);
	const now = new Date();
	if (date.toDateString() === now.toDateString()) {
		return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
	}
	const yesterday = new Date(now);
	yesterday.setDate(now.getDate() - 1);
	if (date.toDateString() === yesterday.toDateString()) return "昨天";
	return date.toLocaleDateString("zh-CN", { weekday: "short", hour: "2-digit", minute: "2-digit" });
}

function activityMeta(intent: string) {
	if (REPLY_HINT.test(intent)) {
		return { label: "生成回复", Icon: MessageCircleReply, tone: "violet" } as const;
	}
	if (REWRITE_HINT.test(intent)) {
		return { label: "整理内容", Icon: WandSparkles, tone: "blue" } as const;
	}
	if (ACTION_HINT.test(intent)) {
		return { label: "完成动作", Icon: CheckCircle2, tone: "green" } as const;
	}
	return { label: "语音输入", Icon: Mic2, tone: "peach" } as const;
}

function useLiveContextTargets(snapshot: HomeSnapshot) {
	const [targets, setTargets] = useState<ContextTarget[]>(() =>
		buildContextTargets({
			activeApp: snapshot.liveContext.activeApp,
			activeWindow: snapshot.liveContext.activeWindow,
			recentUrls: snapshot.liveContext.recentUrls,
			events: [],
		}),
	);

	useEffect(() => {
		if (typeof window.fold === "undefined") return;

		const apply = (ctx: LiveContextLite) => {
			setTargets(
				buildContextTargets({
					activeApp: ctx.activeApp,
					activeWindow: ctx.activeWindow,
					activeAppPath: ctx.activeAppPath,
					recentUrls: ctx.recentUrls ?? [],
					events: ctx.events ?? [],
				}),
			);
		};

		apply({
			activeApp: snapshot.liveContext.activeApp,
			activeWindow: snapshot.liveContext.activeWindow,
			activeAppPath: null,
			recentUrls: snapshot.liveContext.recentUrls,
			recentFiles: snapshot.liveContext.recentFiles,
			clipboardPreview: null,
			recentClipboards: [],
			events: [],
		});

		void window.fold.getLiveContext().then((ctx) => apply(ctx));

		const off = window.fold.onContextEvent(() => {
			void window.fold.getLiveContext().then((ctx) => apply(ctx));
		});

		return () => off();
	}, [snapshot.liveContext.activeApp, snapshot.liveContext.activeWindow, snapshot.liveContext.recentUrls]);

	return targets;
}

function focusTarget(target: ContextTarget) {
	if (typeof window.fold === "undefined") return;
	if (target.kind === "app") {
		void window.fold.focusContext({ kind: "app", appName: target.appName });
		return;
	}
	void window.fold.focusContext({ kind: "url", url: target.url });
}

function useClipboardHistory() {
	const [history, setHistory] = useState<ClipboardHistoryItem[]>([]);
	const [dismissedId, setDismissedId] = useState<string | null>(null);

	useEffect(() => {
		if (typeof window.fold === "undefined") return;
		const apply = (ctx: LiveContextLite) => {
			const next = ctx.recentClipboards ?? [];
			setHistory(next);
			// 新一次复制后重新提示
			setDismissedId((prev) => {
				const latestId = next[0]?.id ?? null;
				return prev && latestId && prev !== latestId ? null : prev;
			});
		};
		void window.fold.getLiveContext().then(apply);
		const off = window.fold.onContextEvent(() => {
			void window.fold.getLiveContext().then(apply);
		});
		return () => off();
	}, []);

	return { history, dismissedId, dismiss: setDismissedId };
}

function ContextSceneSection({
	targets,
	onFocus,
}: {
	targets: ContextTarget[];
	onFocus: (target: ContextTarget) => void;
}) {
	const [expanded, setExpanded] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);
	const [overflows, setOverflows] = useState(false);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el || expanded) {
			setOverflows(false);
			return;
		}
		const check = () => setOverflows(el.scrollWidth > el.clientWidth + 2);
		check();
		const ro = new ResizeObserver(check);
		ro.observe(el);
		return () => ro.disconnect();
	}, [targets, expanded]);

	const showToggle = targets.length > 0 && (overflows || expanded);

	return (
		<section className="fold-context-scene" aria-label="回到现场">
			<div className="fold-context-scene-head">
				<h2 className="fold-context-scene-title">回到现场</h2>
				{showToggle ? (
					<button
						type="button"
						className="fold-context-scene-toggle"
						onClick={() => setExpanded((open) => !open)}
						aria-expanded={expanded}
					>
						{expanded ? "收起" : "展开全部"}
						<ChevronDown size={14} className={expanded ? "is-open" : undefined} strokeWidth={2} />
					</button>
				) : null}
			</div>
			{targets.length > 0 ? (
				<div
					className={`fold-context-scene-scroll${expanded ? " is-expanded" : ""}${overflows && !expanded ? " has-overflow" : ""}`}
				>
					<div
						ref={scrollRef}
						className={`fold-context-scene-chips${expanded ? " is-expanded" : " is-scroll"}`}
					>
						{targets.map((target) => (
							<ContextTargetChip
								key={target.id}
								target={target}
								onClick={() => onFocus(target)}
							/>
						))}
					</div>
				</div>
			) : (
				<p className="fold-context-scene-empty">
					切换几个应用或浏览几个页面后，你刚操作过的现场会出现在这里。
				</p>
			)}
		</section>
	);
}

function ClipboardRecallBanner({
	onNavigateWork,
}: {
	onNavigateWork: () => void;
}) {
	const { history, dismissedId, dismiss } = useClipboardHistory();
	const [restoring, setRestoring] = useState(false);

	const offer = offerClipboardRecovery(history);
	if (!offer) return null;
	if (dismissedId === offer.current.id) return null;

	const { previous, current } = offer;

	const preview = previous.text.slice(0, 72) + (previous.text.length > 72 ? "…" : "");
	const app = previous.appName ?? "未知应用";

	return (
		<section className="fold-clipboard-recall-banner" aria-label="复制找回">
			<div className="fold-clipboard-recall-copy">
				<p className="fold-clipboard-recall-title">你刚换了复制内容</p>
				<p className="fold-clipboard-recall-sub">
					上一段来自 {app}，需要找回来吗？
				</p>
				<p className="fold-clipboard-recall-preview" title={previous.text}>
					{preview}
				</p>
			</div>
			<div className="fold-clipboard-recall-actions">
				<button
					type="button"
					className="fold-clipboard-recall-btn is-primary"
					disabled={restoring}
					onClick={() => {
						setRestoring(true);
						void window.fold
							.restoreClipboard({ id: previous.id, text: previous.text })
							.finally(() => setRestoring(false));
					}}
				>
					{restoring ? "恢复中…" : "恢复上一段"}
				</button>
				<button type="button" className="fold-clipboard-recall-btn" onClick={onNavigateWork}>
					查看全部
				</button>
				<button
					type="button"
					className="fold-clipboard-recall-dismiss"
					aria-label="忽略"
					onClick={() => dismiss(current.id)}
				>
					<X size={14} strokeWidth={2} />
				</button>
			</div>
		</section>
	);
}

function ZhigengNoticedPanel({
	active,
	targets,
	onNavigate,
}: {
	active: boolean;
	targets: ContextTarget[];
	onNavigate: (section: "work") => void;
}) {
	const [state, setState] = useState<"loading" | "streaming" | "ready">("loading");
	const [dismissed, setDismissed] = useState(false);
	const [reply, setReply] = useState("");
	const [suggestions, setSuggestions] = useState<HomeAhaGuess["suggestions"]>([]);
	const [confidenceLevel, setConfidenceLevel] = useState<HomeAhaGuess["confidenceLevel"]>();
	const runIdRef = useRef<number | null>(null);
	const startedRef = useRef(false);
	const wasActiveRef = useRef(false);
	const lastRunAtRef = useRef(0);
	const evidence = targets
		.slice(0, 3)
		.map((target) => target.kind === "app" ? target.appName : target.label);

	useEffect(() => {
		if (typeof window.fold === "undefined") {
			setReply("预览模式下无法读取当前情境。");
			setState("ready");
			return;
		}

		const offChunk = window.fold.onAhaGuessChunk(({ runId, chunk }) => {
			if (runIdRef.current !== runId) return;
			setReply((prev) => prev + chunk);
			setState("streaming");
		});

		const offDone = window.fold.onAhaGuessDone(({ runId, suggestions: next, error, reply: finalReply, confidenceLevel: level }) => {
			if (runIdRef.current !== runId) return;
			if (error) setReply(error);
			else if (finalReply) setReply(finalReply);
			if (next) setSuggestions(next);
			if (level) setConfidenceLevel(level);
			setState("ready");
			runIdRef.current = null;
		});

		return () => {
			offChunk();
			offDone();
		};
	}, []);

	const startGuess = async () => {
		if (typeof window.fold === "undefined") return;
		setReply("");
		setSuggestions([]);
		setConfidenceLevel(undefined);
		setState("loading");
		startedRef.current = true;
		lastRunAtRef.current = Date.now();
		const started = await window.fold.startAhaGuess();
		if (!started.ok || started.runId == null) {
			setReply("暂时没看清楚，稍后再试。");
			setState("ready");
			return;
		}
		runIdRef.current = started.runId;
		setState("streaming");
	};

	useEffect(() => {
		if (!active) {
			wasActiveRef.current = false;
			return;
		}
		const entering = !wasActiveRef.current;
		wasActiveRef.current = true;
		if (!entering) return;
		// 2 分钟内回到主页复用上次结果，避免每次切页都重跑「注意到了」；手动「刷新」不受限。
		if (startedRef.current && Date.now() - lastRunAtRef.current < 120_000) return;
		setDismissed(false);
		void startGuess();
	}, [active]);

	useEffect(() => {
		if (state !== "loading" && state !== "streaming") return;
		const timer = window.setTimeout(() => {
			setReply((prev) => prev || "暂时没看清楚，可以刷新再试。");
			setState("ready");
			runIdRef.current = null;
		}, 25_000);
		return () => window.clearTimeout(timer);
	}, [state]);

	const dismiss = () => {
		if (typeof window.fold !== "undefined") {
			void window.fold.cancelAhaGuess();
		}
		runIdRef.current = null;
		setDismissed(true);
	};

	if (dismissed) {
		return (
			<button
				type="button"
				className="fold-aha-trigger fold-aha-trigger--compact"
				onClick={() => {
					setDismissed(false);
					void startGuess();
				}}
			>
				<Sparkles size={16} strokeWidth={1.8} />
				知更 注意到了
			</button>
		);
	}

	return (
		<section className="fold-aha-panel" aria-label="知更 注意到了">
			<div className="fold-aha-head-row">
				<div className="fold-aha-title">
					<Sparkles size={14} strokeWidth={1.8} />
					<span>知更 注意到了</span>
					{confidenceLevel === "low" ? (
						<span className="fold-aha-confidence">把握较低</span>
					) : confidenceLevel === "medium" ? (
						<span className="fold-aha-confidence fold-aha-confidence--medium">大致猜测</span>
					) : null}
				</div>
				{state === "ready" && reply ? (
					<button type="button" className="fold-aha-close" onClick={dismiss} aria-label="收起">
						<X size={14} strokeWidth={2} />
					</button>
				) : null}
			</div>

			{state === "loading" && !reply ? (
				<div className="fold-aha-loading">
					<span>正在理解你的情境…</span>
				</div>
			) : (
				<p className="fold-aha-reply">
					{reply || "正在理解你的情境…"}
					{state === "streaming" ? <span className="fold-aha-cursor" aria-hidden="true" /> : null}
				</p>
			)}

			{state === "ready" && suggestions.length > 0 ? (
				<div className="fold-aha-chips">
					{suggestions.slice(0, 3).map((item) => (
						<span key={item.intent} className="fold-aha-chip" title={item.reason}>
							{item.label}
						</span>
					))}
				</div>
			) : null}

			{state === "ready" && evidence.length > 0 ? (
				<div className="fold-aha-evidence" aria-label="判断依据">
					<strong>判断依据</strong>
					<span>{evidence.join("·")}</span>
				</div>
			) : null}

			{state === "ready" ? (
				<div className="fold-aha-foot">
					<button type="button" className="fold-aha-btn is-ghost" onClick={() => void startGuess()}>
						<RefreshCw size={13} strokeWidth={2} />
						猜得不对，重新判断
					</button>
					<button type="button" className="fold-aha-btn" onClick={() => onNavigate("work")}>
						查看轨迹
					</button>
				</div>
			) : state === "streaming" && reply ? (
				<div className="fold-aha-foot">
					<button type="button" className="fold-aha-btn is-ghost" onClick={() => onNavigate("work")}>
						查看轨迹
					</button>
				</div>
			) : null}
		</section>
	);
}

export function OverviewSection({
	active,
	snapshot,
	onNavigate,
}: {
	active: boolean;
	snapshot: HomeSnapshot;
	onNavigate: (section: "profile" | "tasks" | "connections" | "settings" | "work") => void;
}) {
	const contextTargets = useLiveContextTargets(snapshot);
	const hasIssue =
		snapshot.capabilitySnapshot.summary.ready < snapshot.capabilitySnapshot.summary.total ||
		snapshot.connections.some((connection) => connection.status === "error");
	const capSummary = snapshot.capabilitySnapshot.summary;
	const metrics = estimateHomeMetrics(snapshot.episodes);
	const profile = snapshot.userProfile;
	const learned = [
		profile?.communicationStyle ? `你偏好${profile.communicationStyle}` : null,
		profile?.preferredTools?.[0] ? `你常用 ${profile.preferredTools[0]} 完成任务` : null,
		profile?.workPatterns?.[0] ?? null,
	].filter((item): item is string => Boolean(item));
	const routine = profile?.workPatterns?.[0] ?? "完成更多任务后，知更 会发现你的重复流程";

	return (
		<div className="fold-dashboard">
			<header className="fold-dashboard-hero">
				<div>
					<h1>{TAGLINE}</h1>
					<p>
						{TAGLINE_LEAD}
						<br />
						{TAGLINE_FOOT}
					</p>
				</div>
				<button
					type="button"
					className={`fold-ready-pill${hasIssue ? " has-issue" : ""}`}
					onClick={() => hasIssue && onNavigate("connections")}
				>
					<span />
					{hasIssue ? "有连接需要处理" : `${capSummary.modeLabel} · ${capSummary.ready}/${capSummary.total} 就绪`}
				</button>
			</header>

			<ContextSceneSection targets={contextTargets} onFocus={focusTarget} />

			<ClipboardRecallBanner onNavigateWork={() => onNavigate("work")} />

			<ZhigengNoticedPanel active={active} targets={contextTargets} onNavigate={(section) => onNavigate(section)} />

			<section className="fold-home-metrics-compact" aria-label="本周概览">
				<div className="fold-home-metric-pill">
					<Mic2 size={15} strokeWidth={1.8} />
					<span>字数</span>
					<strong>{metrics.characters.toLocaleString("zh-CN")}</strong>
				</div>
				<div className="fold-home-metric-pill">
					<MessageCircleReply size={15} strokeWidth={1.8} />
					<span>回复</span>
					<strong>{metrics.replies}</strong>
				</div>
				<div className="fold-home-metric-pill">
					<CheckCircle2 size={15} strokeWidth={1.8} />
					<span>行动</span>
					<strong>{metrics.actions}</strong>
				</div>
				<div className="fold-home-metric-pill is-highlight">
					<Clock3 size={15} strokeWidth={1.8} />
					<span>节省</span>
					<strong>{formatSavedDuration(metrics.savedMinutes)}</strong>
				</div>
			</section>

			<div className="fold-dashboard-grid">
				<section className="fold-activity-section">
					<div className="fold-section-heading">
						<h2>最近活动</h2>
						<button type="button" onClick={() => onNavigate("tasks")}>
							查看全部 <ArrowRight size={15} />
						</button>
					</div>
					<div className="fold-activity-list">
						{snapshot.episodes.length ? (
							snapshot.episodes.slice(0, 3).map((episode: HomeEpisode) => {
								const meta = activityMeta(episode.intent);
								return (
									<button
										type="button"
										className="fold-activity-row"
										key={episode.id}
										onClick={() => onNavigate("tasks")}
									>
										<span className={`fold-activity-icon is-${meta.tone}`}>
											<meta.Icon size={18} strokeWidth={1.8} />
										</span>
										<span className="fold-activity-copy">
											<strong>
												{meta.label} · {episode.intent}
											</strong>
											<small>{episode.summary || "知更 已完成处理"}</small>
										</span>
										<time>{formatActivityTime(episode.timestamp)}</time>
										<span className={`fold-activity-state is-${episode.status}`}>
											{episode.status === "success" || episode.status === "recovered" ? <Check size={14} strokeWidth={2.4} /> : null}
										</span>
									</button>
								);
							})
						) : (
							<div className="fold-dashboard-empty fold-dashboard-empty--inline">
								<Mic2 size={20} />
								<div>
									<strong>从第一次开口开始</strong>
									<p>按住右 ⌘ 转写，或 ⌥ Space 交给 Agent。</p>
								</div>
							</div>
						)}
					</div>
				</section>

				<section className="fold-intelligence-section">
					<div className="fold-section-heading">
						<h2>你的 知更</h2>
						<button type="button" onClick={() => onNavigate("profile")}>
							管理记忆 <ArrowRight size={15} />
						</button>
					</div>
					<div className="fold-intelligence-panel">
						<h3>
							<Sparkles size={17} /> 知更 学会了
						</h3>
						{learned.length ? (
							<ul>
								{learned.slice(0, 3).map((item) => (
									<li key={item}>{item}</li>
								))}
							</ul>
						) : (
							<p className="fold-intelligence-empty">
								知更 会在这里展示经过你确认的表达偏好和工作习惯。
							</p>
						)}
						<div className="fold-routine">
							<h3>
								<Repeat2 size={17} /> 你的重复流程
							</h3>
							<strong>{routine}</strong>
							<small>
								{learned.length ? "下次可以让 知更 主动提醒" : "保持使用，知更 会逐渐理解你的节奏"}
							</small>
						</div>
					</div>
				</section>
			</div>
		</div>
	);
}
