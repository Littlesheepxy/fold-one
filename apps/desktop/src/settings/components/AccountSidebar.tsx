import { useEffect, useRef, useState } from "react";
import { ChevronDown, Crown, Gauge, LogOut, RefreshCw, Settings, UserRound } from "lucide-react";
import type { FoldConfig, PlanTier } from "../types.js";
import {
	AccountSettingsModal,
	QuotaOneLine,
	type AccountSettingsTab,
} from "./AccountSettingsModal.js";

const PLAN_LABEL: Record<PlanTier, string> = {
	free: "免费版",
	pro: "Pro",
	ultra: "升级版",
};

export function AccountSidebar({
	config,
	open,
	settingsTab = "general",
	onOpenSettings,
	onClose,
	onConfigReload,
}: {
	config: FoldConfig;
	open: boolean;
	settingsTab?: AccountSettingsTab;
	onOpenSettings: (tab: AccountSettingsTab) => void;
	onClose: () => void;
	onConfigReload?: () => void | Promise<void>;
}) {
	const rootRef = useRef<HTMLDivElement>(null);
	const [menuOpen, setMenuOpen] = useState(false);
	const [quotaOpen, setQuotaOpen] = useState(false);
	const [busy, setBusy] = useState(false);
	const planTier = config.planTier ?? "free";
	const planLabel = PLAN_LABEL[planTier];
	const signedIn = Boolean(config.accountUserId);
	const isPro = planTier === "pro" || planTier === "ultra";
	const trialRemaining = config.trialSmartActionsRemaining ?? 20;
	const voiceMin =
		typeof config.voiceSecondsRemaining === "number"
			? Math.max(0, Math.floor(config.voiceSecondsRemaining / 60))
			: null;
	const voiceLimitMin =
		typeof config.voiceSecondsLimit === "number"
			? Math.max(0, Math.floor(config.voiceSecondsLimit / 60))
			: isPro
				? 600
				: 30;
	const smartRemaining =
		typeof config.smartActionsRemaining === "number" ? config.smartActionsRemaining : null;
	const smartLimit = config.smartActionsLimit ?? (isPro ? 2000 : 20);

	useEffect(() => {
		if (!menuOpen) {
			setQuotaOpen(false);
			return;
		}
		const onPointer = (e: MouseEvent) => {
			if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false);
		};
		document.addEventListener("mousedown", onPointer);
		return () => document.removeEventListener("mousedown", onPointer);
	}, [menuOpen]);

	const openSettings = (tab: AccountSettingsTab = "general") => {
		setMenuOpen(false);
		onOpenSettings(tab);
	};

	const sync = async () => {
		setBusy(true);
		try {
			await window.fold.accountSync();
			await onConfigReload?.();
		} finally {
			setBusy(false);
		}
	};

	const logout = async () => {
		setBusy(true);
		try {
			await window.fold.accountLogout();
			await onConfigReload?.();
		} finally {
			setBusy(false);
			setMenuOpen(false);
			onClose();
		}
	};

	const quotaLine = signedIn
		? [
				voiceMin != null ? `云端 ${voiceMin}/${voiceLimitMin}` : null,
				smartRemaining != null ? `智能 ${smartRemaining}/${smartLimit}` : null,
			]
				.filter(Boolean)
				.join(" · ")
		: `体验 ${trialRemaining} 次`;

	return (
		<>
			<div className="fold-home-sidebar-footer" ref={rootRef}>
				{menuOpen && (
					<div className="fold-account-menu" role="menu">
						<div className="fold-account-menu-head">
							<div className="fold-home-account-avatar" aria-hidden="true">
								<UserRound size={16} strokeWidth={1.75} />
							</div>
							<div className="min-w-0 flex-1">
								<p className="fold-account-menu-name">
									{config.accountName || config.accountEmail || "本地用户"}
								</p>
								<span className={`fold-account-plan-pill is-${planTier}`}>{planLabel}</span>
							</div>
						</div>

						{signedIn && (
							<div className={`fold-account-menu-quota-wrap${quotaOpen ? " is-open" : ""}`}>
								<button
									type="button"
									className="fold-account-menu-quota"
									aria-expanded={quotaOpen}
									onClick={() => setQuotaOpen((v) => !v)}
								>
									<Gauge size={14} strokeWidth={1.75} />
									<span className="fold-account-menu-quota-label">剩余额度</span>
									{!quotaOpen && (
										<span className="fold-account-menu-quota-value">{quotaLine || "同步后可见"}</span>
									)}
									<ChevronDown
										size={14}
										strokeWidth={2}
										className={`fold-account-menu-chevron${quotaOpen ? " is-open" : ""}`}
									/>
								</button>
								{quotaOpen && (
									<div className="fold-account-menu-quota-detail">
										{voiceMin != null && (
											<QuotaOneLine
												label="云端"
												remaining={voiceMin}
												limit={voiceLimitMin}
												unit="分"
											/>
										)}
										{smartRemaining != null && (
											<QuotaOneLine
												label="智能"
												remaining={smartRemaining}
												limit={smartLimit}
												unit="次"
											/>
										)}
									</div>
								)}
							</div>
						)}

						<div className="fold-account-menu-sep" />

						{!isPro && (
							<button
								type="button"
								role="menuitem"
								className="fold-account-menu-upgrade"
								onClick={() => openSettings("subscription")}
							>
								<Crown size={14} strokeWidth={1.75} />
								升级会员
							</button>
						)}
						<button type="button" role="menuitem" onClick={() => openSettings("general")}>
							<Settings size={14} strokeWidth={1.75} />
							账户设置
						</button>
						{signedIn && (
							<>
								<button type="button" role="menuitem" disabled={busy} onClick={() => void sync()}>
									<RefreshCw size={14} strokeWidth={1.75} />
									{busy ? "同步中…" : "同步权益"}
								</button>
								<div className="fold-account-menu-sep" />
								<button type="button" role="menuitem" disabled={busy} onClick={() => void logout()}>
									<LogOut size={14} strokeWidth={1.75} />
									退出登录
								</button>
							</>
						)}
					</div>
				)}
				<div className={`fold-home-account${open || menuOpen ? " is-active" : ""}`}>
					<button
						type="button"
						className="fold-home-account-main"
						onClick={() => setMenuOpen((v) => !v)}
						aria-label="账户菜单"
						aria-expanded={menuOpen}
					>
						<div className="fold-home-account-avatar" aria-hidden="true">
							<UserRound size={16} strokeWidth={1.75} />
						</div>
						<div className="fold-home-account-copy min-w-0 flex-1 text-left">
							<p className="fold-home-account-name">
								{config.accountName || config.accountEmail || "本地用户"}
							</p>
							<p className="fold-home-account-meta">
								{signedIn ? planLabel : "未登录"}
								{signedIn && voiceMin != null
									? ` · 云端 ${voiceMin} 分`
									: !signedIn
										? ` · 体验 ${trialRemaining} 次`
										: ""}
							</p>
						</div>
					</button>
				</div>
			</div>
			{open && (
				<AccountSettingsModal
					config={config}
					initialTab={settingsTab}
					onClose={onClose}
					onConfigReload={onConfigReload}
				/>
			)}
		</>
	);
}
