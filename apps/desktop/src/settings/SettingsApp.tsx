import { useCallback, useEffect, useRef, useState } from "react";
import type { FoldConfig, HomeSection, HomeSnapshot, PlanTier, CapabilitySnapshot } from "./types.js";
import { NavIcon } from "./components/NavIcons.js";
import { OverviewSection } from "./sections/OverviewSection.js";
import { ProfileSection } from "./sections/ProfileSection.js";
import { WorkTrailSection } from "./sections/WorkTrailSection.js";
import { TasksSection } from "./sections/TasksSection.js";
import { ConnectionsSection } from "./sections/ConnectionsSection.js";
import { AccountSection } from "./sections/AccountSection.js";
import { SettingsSection } from "./sections/SettingsSection.js";
import { AccountSidebar } from "./components/AccountSidebar.js";
import { SidebarShortcuts } from "./components/SidebarShortcuts.js";
import { MARK_ASSET, PRODUCT_NAME } from "../brand/constants.js";

const NAV: Array<{ id: HomeSection; label: string }> = [
	{ id: "overview", label: "主页" },
	{ id: "tasks", label: "活动" },
	{ id: "work", label: "轨迹" },
	{ id: "profile", label: "记忆" },
	{ id: "connections", label: "连接" },
	{ id: "settings", label: "设置" },
];

const PLAN_BADGE: Record<PlanTier, string> = {
	free: "Free",
	pro: "Pro",
	ultra: "Ultra",
};

const EMPTY_CAPABILITY_SNAPSHOT: CapabilitySnapshot = {
	executionMode: "auto",
	capabilities: [],
	executors: [],
	groups: [],
	summary: { ready: 0, total: 0, modeLabel: "自动" },
};

const EMPTY_SNAPSHOT: HomeSnapshot = {
	episodes: [],
	liveContext: {
		activeApp: null,
		activeWindow: null,
		recentUrls: [],
		recentFiles: [],
	},
	connections: [],
	capabilitySnapshot: EMPTY_CAPABILITY_SNAPSHOT,
	configSummary: {
		hasPlannerKey: false,
		hasAsr: false,
		mailProvider: "auto",
		allowAgentSubagents: false,
		allowWorkbuddy: true,
		allowUitars: false,
	},
	userProfile: null,
};

const PREVIEW_SNAPSHOT: HomeSnapshot = {
	episodes: [
		{ id: "1", intent: "起草回复：产品路线图建议", status: "success", timestamp: Date.now() - 18 * 60_000, summary: "已根据会议纪要起草并发送给团队。" },
		{ id: "2", intent: "整理项目周报", status: "success", timestamp: Date.now() - 19 * 60 * 60_000, summary: "汇总进展、风险与下一步，已生成文档。" },
		{ id: "3", intent: "提醒我跟进客户反馈", status: "success", timestamp: Date.now() - 28 * 60 * 60_000, summary: "提取关键需求与疑问，已创建待办。" },
		{ id: "4", intent: "研究竞品定价策略", status: "success", timestamp: Date.now() - 52 * 60 * 60_000, summary: "完成产品对比，生成要点与参考。" },
		{ id: "5", intent: "改写发布更新说明", status: "partial", timestamp: Date.now() - 76 * 60 * 60_000, summary: "已完成初稿，等待审阅。" },
	],
	liveContext: { activeApp: "Google Chrome", activeWindow: "知更 首页设计", recentUrls: [], recentFiles: [] },
	connections: [{ id: "codex", label: "Codex", status: "ok" }],
	capabilitySnapshot: {
		executionMode: "auto",
		capabilities: [],
		executors: [{ id: "codex", label: "Codex", available: true, capabilities: ["写代码"], isDefault: true }],
		groups: [{ id: "communicate", label: "沟通协作", ready: 1, total: 5 }],
		summary: { ready: 4, total: 7, modeLabel: "自动", executorLabel: "Codex" },
	},
	configSummary: { hasPlannerKey: true, hasAsr: true, mailProvider: "auto", allowAgentSubagents: true, allowWorkbuddy: true, allowUitars: false },
	userProfile: {
		communicationStyle: "简洁、结构化的表达方式",
		preferredTools: ["Codex"],
		workPatterns: ["每周一 9:00 生成项目进展摘要"],
	},
};

const SIDEBAR_WIDTH_KEY = "fold:sidebar-width";
const SIDEBAR_MIN = 148;
const SIDEBAR_MAX = 320;

function loadSidebarWidth(): number {
	const raw = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
	if (Number.isFinite(raw) && raw >= SIDEBAR_MIN && raw <= SIDEBAR_MAX) return raw;
	return 236;
}

export function SettingsApp() {
	const browserPreview = import.meta.env.DEV && typeof window.fold === "undefined";
	const [section, setSection] = useState<HomeSection>("overview");
	const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
	const [sidebarWidth, setSidebarWidth] = useState(loadSidebarWidth);
	const dragState = useRef<{ startX: number; startWidth: number } | null>(null);

	const onSidebarResizeStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			dragState.current = { startX: e.clientX, startWidth: sidebarWidth };
			const onMove = (ev: MouseEvent) => {
				if (!dragState.current) return;
				const next = Math.min(
					SIDEBAR_MAX,
					Math.max(SIDEBAR_MIN, dragState.current.startWidth + ev.clientX - dragState.current.startX),
				);
				setSidebarWidth(next);
			};
			const onUp = () => {
				dragState.current = null;
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.classList.remove("fold-sidebar-resizing");
				setSidebarWidth((w) => {
					localStorage.setItem(SIDEBAR_WIDTH_KEY, String(w));
					return w;
				});
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
			document.body.classList.add("fold-sidebar-resizing");
		},
		[sidebarWidth],
	);
	const [config, setConfig] = useState<FoldConfig>({});
	const [snapshot, setSnapshot] = useState<HomeSnapshot>(browserPreview ? PREVIEW_SNAPSHOT : EMPTY_SNAPSHOT);
	const [saved, setSaved] = useState(false);
	const [loading, setLoading] = useState(!browserPreview);

	const refreshSnapshot = async () => {
		const data = await window.fold.getHomeSnapshot();
		setSnapshot(data);
	};

	useEffect(() => {
		if (browserPreview) return;
		return window.fold.onHomeNavigate((s) => {
			if (
				s === "overview" ||
				s === "profile" ||
				s === "work" ||
				s === "tasks" ||
				s === "connections" ||
				s === "account" ||
				s === "settings"
			) {
				setSection(s);
			}
		});
	}, [browserPreview]);

	useEffect(() => {
		if (browserPreview) return;
		void Promise.all([window.fold.getConfig(), window.fold.getHomeSnapshot()])
			.then(([c, snap]) => {
				setConfig(c);
				setSnapshot(snap);
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, [browserPreview]);

	useEffect(() => {
		if (browserPreview) return;
		if (section !== "settings" && section !== "account") {
			void refreshSnapshot();
		}
	}, [browserPreview, section]);

	const update = (key: keyof FoldConfig, value: string) => {
		setConfig((c) => ({ ...c, [key]: value }));
		setSaved(false);
	};
	const updateBoolean = (key: keyof FoldConfig, value: boolean) => {
		setConfig((c) => ({ ...c, [key]: value }));
		setSaved(false);
	};

	const handleSave = async () => {
		await window.fold.saveConfig(config);
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
		void refreshSnapshot();
	};

	const persistBoolean = async (key: keyof FoldConfig, value: boolean) => {
		const next = { ...config, [key]: value };
		setConfig(next);
		await window.fold.saveConfig(next);
		setSaved(true);
		setTimeout(() => setSaved(false), 2000);
	};

	const navigateTo = (next: HomeSection, taskId?: string) => {
		if (taskId) setFocusTaskId(taskId);
		setSection(next);
	};

	if (loading) {
		return (
			<div className="fold-home-shell">
				<div className="fold-home flex h-full items-center justify-center text-sm text-[#86868b]">
					加载中…
				</div>
				<div className="fold-home-window-drag" aria-hidden="true" />
			</div>
		);
	}

	const planTier = config.planTier ?? "free";

	return (
		<div className="fold-home-shell">
			<div className="fold-home flex h-full">
			<aside className="fold-home-sidebar" style={{ width: sidebarWidth }}>
				<div className="fold-home-brand">
					<img className="fold-home-brand-mark" src={MARK_ASSET} alt="" />
					<p className="fold-home-brand-name">{PRODUCT_NAME}</p>
					<span className={`fold-home-plan-badge is-${planTier}`}>{PLAN_BADGE[planTier]}</span>
				</div>

				<nav className="fold-home-nav">
					{NAV.map((item) => {
						const active = section === item.id;
						return (
							<button
								key={item.id}
								type="button"
								onClick={() => setSection(item.id)}
								className={`fold-home-nav-item${active ? " active" : ""}`}
							>
								<NavIcon
									section={item.id}
									className={active ? "text-[#1d1d1f]" : "text-[#aeaeb2]"}
								/>
								{item.label}
							</button>
						);
					})}
				</nav>

				<SidebarShortcuts />

				<AccountSidebar
					config={config}
					active={section === "account"}
					onOpenAccount={() => setSection("account")}
				/>

				<div
					className="fold-home-sidebar-resizer"
					onMouseDown={onSidebarResizeStart}
					role="separator"
					aria-orientation="vertical"
					aria-label="调整侧栏宽度"
				/>
			</aside>

			<main className="fold-home-main">
				<div
					className={`fold-home-content${
						section === "overview"
							? " fold-home-content--dashboard"
							: section === "tasks" || section === "profile" || section === "work"
								? " fold-home-content--wide"
								: ""
					}`}
				>
					<div hidden={section !== "overview"}>
						<OverviewSection
							active={section === "overview"}
							snapshot={snapshot}
							onNavigate={(s) => navigateTo(s)}
						/>
					</div>
					{section === "profile" && (
						<ProfileSection
							snapshot={snapshot}
							active={section === "profile"}
							onNavigate={(s, taskId) => navigateTo(s, taskId)}
						/>
					)}
					{section === "work" && <WorkTrailSection snapshot={snapshot} />}
					{section === "tasks" && (
						<TasksSection
							active={section === "tasks"}
							focusEpisodeId={focusTaskId}
							onFocusConsumed={() => setFocusTaskId(null)}
						/>
					)}
					{section === "connections" && (
						<ConnectionsSection
							snapshot={snapshot}
							onRefresh={refreshSnapshot}
							onOpenSettings={() => setSection("settings")}
							onSaveConfig={async (next) => {
								await window.fold.saveConfig(next);
								setConfig(next);
							}}
						/>
					)}
					{section === "account" && (
						<AccountSection config={config} onUpdate={update} />
					)}
					{section === "settings" && (
						<SettingsSection
							config={config}
							saved={saved}
							onUpdate={update}
							onUpdateBoolean={updateBoolean}
							onSave={() => void handleSave()}
							onPersistBoolean={persistBoolean}
						/>
					)}
				</div>
			</main>
			</div>
			<div className="fold-home-window-drag" aria-hidden="true" />
		</div>
	);
}
