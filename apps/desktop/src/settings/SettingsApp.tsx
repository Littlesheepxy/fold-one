import { useCallback, useEffect, useRef, useState } from "react";
import type { FoldConfig, HomeSection, HomeSnapshot } from "./types.js";
import { FoldLogoMark } from "./components/FoldLogo.js";
import { NavIcon } from "./components/NavIcons.js";
import { OverviewSection } from "./sections/OverviewSection.js";
import { ProfileSection } from "./sections/ProfileSection.js";
import { WorkTrailSection } from "./sections/WorkTrailSection.js";
import { TasksSection } from "./sections/TasksSection.js";
import { ConnectionsSection } from "./sections/ConnectionsSection.js";
import { AccountSection } from "./sections/AccountSection.js";
import { SettingsSection } from "./sections/SettingsSection.js";
import { AccountSidebar } from "./components/AccountSidebar.js";

const NAV: Array<{ id: HomeSection; label: string }> = [
	{ id: "overview", label: "主页" },
	{ id: "profile", label: "个人" },
	{ id: "work", label: "工作轨迹" },
	{ id: "tasks", label: "任务" },
	{ id: "connections", label: "连接" },
	{ id: "settings", label: "设置" },
];

const EMPTY_SNAPSHOT: HomeSnapshot = {
	episodes: [],
	liveContext: {
		activeApp: null,
		activeWindow: null,
		recentUrls: [],
		recentFiles: [],
	},
	connections: [],
	configSummary: {
		hasPlannerKey: false,
		hasAsr: false,
		mailProvider: "auto",
		allowAgentSubagents: false,
		allowWorkbuddy: true,
		allowUitars: false,
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
	const [snapshot, setSnapshot] = useState<HomeSnapshot>(EMPTY_SNAPSHOT);
	const [saved, setSaved] = useState(false);
	const [loading, setLoading] = useState(true);

	const refreshSnapshot = async () => {
		const data = await window.fold.getHomeSnapshot();
		setSnapshot(data);
	};

	useEffect(() => {
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
	}, []);

	useEffect(() => {
		void Promise.all([window.fold.getConfig(), window.fold.getHomeSnapshot()])
			.then(([c, snap]) => {
				setConfig(c);
				setSnapshot(snap);
			})
			.catch(() => {})
			.finally(() => setLoading(false));
	}, []);

	useEffect(() => {
		if (section !== "settings" && section !== "account") {
			void refreshSnapshot();
		}
	}, [section]);

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

	const navigateTo = (next: HomeSection, taskId?: string) => {
		if (taskId) setFocusTaskId(taskId);
		setSection(next);
	};

	if (loading) {
		return (
			<div className="fold-home-shell">
				<div className="fold-home-window-drag" aria-hidden="true" />
				<div className="fold-home flex h-full items-center justify-center text-sm text-[#86868b]">
					加载中…
				</div>
			</div>
		);
	}

	return (
		<div className="fold-home-shell">
			<div className="fold-home-window-drag" aria-hidden="true" />
			<div className="fold-home flex h-full">
			<aside className="fold-home-sidebar" style={{ width: sidebarWidth }}>
				<div className="fold-home-brand">
					<div className="fold-home-brand-mark">
						<FoldLogoMark size={18} />
					</div>
					<div className="min-w-0">
						<p className="text-[13px] font-semibold leading-tight tracking-[-0.01em]">Fold</p>
						<p className="text-[11px] text-[#86868b]">Context Agent</p>
					</div>
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

				<AccountSidebar
					config={config}
					active={section === "account"}
					onOpenAccount={() => setSection("account")}
					onUpgrade={() => setSection("account")}
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
					{section === "overview" && (
						<OverviewSection snapshot={snapshot} onNavigate={(s) => navigateTo(s)} />
					)}
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
						/>
					)}
				</div>
			</main>
			</div>
		</div>
	);
}
