import { useEffect, useState } from "react";
import type { FoldConfig, HomeSection, HomeSnapshot } from "./types.js";
import { FoldLogoMark } from "./components/FoldLogo.js";
import { NavIcon } from "./components/NavIcons.js";
import { OverviewSection } from "./sections/OverviewSection.js";
import { ProfileSection } from "./sections/ProfileSection.js";
import { WorkTrailSection } from "./sections/WorkTrailSection.js";
import { ConnectionsSection } from "./sections/ConnectionsSection.js";
import { SettingsSection } from "./sections/SettingsSection.js";

const NAV: Array<{ id: HomeSection; label: string }> = [
	{ id: "overview", label: "主页" },
	{ id: "profile", label: "个人" },
	{ id: "work", label: "工作轨迹" },
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

export function SettingsApp() {
	const [section, setSection] = useState<HomeSection>("overview");
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
				s === "connections" ||
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
		if (section !== "settings") {
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

	if (loading) {
		return (
			<div className="fold-home-shell">
				<div className="fold-home flex h-full items-center justify-center text-sm text-[#86868b]">
					加载中…
				</div>
			</div>
		);
	}

	return (
		<div className="fold-home-shell">
			<div className="fold-home flex h-full">
			<aside className="fold-home-sidebar">
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
			</aside>

			<main className="fold-home-main">
				<div className="fold-home-content">
					{section === "overview" && (
						<OverviewSection snapshot={snapshot} onNavigate={(s) => setSection(s)} />
					)}
					{section === "profile" && <ProfileSection snapshot={snapshot} />}
					{section === "work" && <WorkTrailSection snapshot={snapshot} />}
					{section === "connections" && (
						<ConnectionsSection
							snapshot={snapshot}
							onRefresh={refreshSnapshot}
							onOpenSettings={() => setSection("settings")}
						/>
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
