import { useEffect, useState } from "react";
import { Check, Crown, LogOut, RefreshCw, X } from "lucide-react";
import type { FoldConfig, PlanTier } from "../types.js";

const PLAN_LABEL: Record<PlanTier, { name: string; tagline: string }> = {
	free: { name: "免费版", tagline: "本地转写不限量 · 云端体验有限" },
	pro: { name: "Pro", tagline: "云端智能转写 600 分钟/月 · 智能代回" },
	ultra: { name: "升级版", tagline: "跨应用 Agent 与高级恢复" },
};

const VOICE_LIMIT_MINUTES: Record<PlanTier, number> = {
	free: 30,
	pro: 300,
	ultra: 300,
};

const PRO_PLANS = [
	{
		id: "monthly" as const,
		title: "Pro 月付",
		price: "¥29.9",
		period: "/月",
		note: "自动续费，可随时取消",
	},
	{
		id: "yearly" as const,
		title: "Pro 年付",
		price: "¥228",
		period: "/年",
		note: "约合 ¥19/月",
	},
];

type AccountState = {
	signedIn: boolean;
	email?: string;
	name?: string;
	planTier: PlanTier;
	voiceSecondsRemaining?: number;
	smartActionsRemaining?: number;
	syncedAt?: number;
};

type Panel = "home" | "plans";

function initials(name?: string, email?: string): string {
	const source = (name || email || "?").trim();
	if (!source) return "?";
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
	return source.slice(0, 2).toUpperCase();
}

function formatSyncedAt(ts?: number): string | null {
	if (!ts) return null;
	const mins = Math.max(0, Math.round((Date.now() - ts) / 60_000));
	if (mins < 1) return "刚刚同步";
	if (mins < 60) return `${mins} 分钟前同步`;
	const hours = Math.round(mins / 60);
	if (hours < 24) return `${hours} 小时前同步`;
	return `${Math.round(hours / 24)} 天前同步`;
}

export function AccountPopover({
	config,
	onClose,
	onConfigReload,
}: {
	config: FoldConfig;
	onClose: () => void;
	onConfigReload?: () => void | Promise<void>;
}) {
	const [account, setAccount] = useState<AccountState>({
		signedIn: Boolean(config.accountUserId),
		email: config.accountEmail,
		name: config.accountName,
		planTier: config.planTier ?? "free",
		voiceSecondsRemaining: config.voiceSecondsRemaining,
		smartActionsRemaining: config.smartActionsRemaining,
		syncedAt: config.accountSyncedAt,
	});
	const [panel, setPanel] = useState<Panel>("home");
	const [busy, setBusy] = useState<"login" | "sync" | "logout" | "plan" | null>(null);
	const [message, setMessage] = useState<string | null>(null);

	useEffect(() => {
		void window.fold.accountGetState().then(setAccount);
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				if (panel === "plans") setPanel("home");
				else onClose();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose, panel]);

	const planTier = account.planTier ?? config.planTier ?? "free";
	const plan = PLAN_LABEL[planTier];
	const voiceLimit = VOICE_LIMIT_MINUTES[planTier];
	const voiceRemainingMin =
		typeof account.voiceSecondsRemaining === "number"
			? Math.max(0, Math.floor(account.voiceSecondsRemaining / 60))
			: null;
	const voicePct =
		voiceRemainingMin != null
			? Math.min(100, Math.round((voiceRemainingMin / voiceLimit) * 100))
			: null;
	const smartRemaining = account.signedIn
		? account.smartActionsRemaining
		: (config.trialSmartActionsRemaining ?? 20);
	const syncedLabel = formatSyncedAt(account.syncedAt);

	const refresh = async (next: AccountState) => {
		setAccount(next);
		await onConfigReload?.();
	};

	const handleLogin = async () => {
		setMessage("请从侧边栏的「账户设置」使用邮箱验证码登录。");
	};

	const handleSync = async () => {
		setBusy("sync");
		setMessage(null);
		try {
			const state = await window.fold.accountSync();
			await refresh(state);
			setMessage("已同步最新会员与配额。");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "同步失败");
		} finally {
			setBusy(null);
		}
	};

	const handleLogout = async () => {
		setBusy("logout");
		setMessage(null);
		try {
			const state = await window.fold.accountLogout();
			await refresh(state);
			setMessage("已退出登录。");
		} finally {
			setBusy(null);
		}
	};

	/** 知更独立账户：方案在桌面内切换；支付通道接入前先落本地权益。 */
	const selectPlan = async (next: PlanTier) => {
		setBusy("plan");
		setMessage(null);
		try {
			const current = await window.fold.getConfig();
			const saved = { ...current, planTier: next };
			await window.fold.saveConfig(saved);
			setAccount((a) => ({ ...a, planTier: next }));
			await onConfigReload?.();
			setPanel("home");
			setMessage(next === "free" ? "已切换到免费版。" : "已切换到 Pro。支付开通后将改为签约扣款。");
		} catch (error) {
			setMessage(error instanceof Error ? error.message : "切换方案失败");
		} finally {
			setBusy(null);
		}
	};

	return (
		<div
			className="fold-account-popover"
			role="dialog"
			aria-modal="true"
			aria-label="账户"
			onClick={(e) => e.stopPropagation()}
		>
			<div className="fold-account-popover-head">
				<p className="fold-account-popover-title">
					{panel === "plans" ? "选择方案" : "账户"}
				</p>
				<button
					type="button"
					className="fold-account-popover-close"
					onClick={() => (panel === "plans" ? setPanel("home") : onClose())}
					aria-label={panel === "plans" ? "返回" : "关闭"}
				>
					<X size={14} strokeWidth={2} />
				</button>
			</div>

			{panel === "home" ? (
				<>
					<div className="fold-account-identity">
						<div className="fold-account-avatar" aria-hidden="true">
							{account.signedIn ? (
								initials(account.name, account.email)
							) : (
								<Crown size={16} strokeWidth={1.75} />
							)}
						</div>
						<div className="min-w-0 flex-1">
							<p className="fold-account-identity-name">
								{account.signedIn
									? account.name || account.email || "已登录"
									: "本地用户"}
							</p>
							<p className="fold-account-identity-meta">
								{account.signedIn
									? account.email || "知更账户已连接"
									: "登录后可同步云端配额与跨设备权益"}
							</p>
						</div>
						<span className={`fold-account-plan-pill is-${planTier}`}>{plan.name}</span>
					</div>

					<div className="fold-account-plan-card">
						<p className="fold-account-plan-tagline">{plan.tagline}</p>
						{voicePct != null && voiceRemainingMin != null && (
							<div className="fold-account-quota">
								<div className="fold-account-quota-row">
									<span>云端语音</span>
									<span>
										剩余 {voiceRemainingMin} / {voiceLimit} 分钟
									</span>
								</div>
								<div className="fold-account-quota-bar" aria-hidden="true">
									<span style={{ width: `${voicePct}%` }} />
								</div>
							</div>
						)}
						{typeof smartRemaining === "number" && (
							<p className="fold-account-quota-note">
								{account.signedIn ? "智能操作剩余" : "本地体验剩余"} {smartRemaining}{" "}
								次
							</p>
						)}
						{!account.signedIn && planTier === "free" && (
							<p className="fold-account-quota-note">
								免费版含云端体验约 {voiceLimit} 分钟/月
							</p>
						)}
						{syncedLabel && <p className="fold-account-quota-note">{syncedLabel}</p>}
					</div>

					<div className="fold-account-actions">
						{!account.signedIn ? (
							<button
								type="button"
								disabled={busy !== null}
								onClick={() => void handleLogin()}
								className="fold-account-btn primary"
							>
								{busy === "login" ? "等待授权…" : "登录知更账户"}
							</button>
						) : (
							<>
								<button
									type="button"
									disabled={busy !== null}
									onClick={() => void handleSync()}
									className="fold-account-btn"
								>
									<RefreshCw size={13} strokeWidth={2} />
									{busy === "sync" ? "同步中…" : "同步权益"}
								</button>
								<button
									type="button"
									disabled={busy !== null}
									onClick={() => void handleLogout()}
									className="fold-account-btn"
								>
									<LogOut size={13} strokeWidth={2} />
									{busy === "logout" ? "退出中…" : "退出登录"}
								</button>
							</>
						)}
						<button
							type="button"
							disabled={busy !== null}
							onClick={() => setPanel("plans")}
							className="fold-account-btn link"
						>
							{planTier === "pro" || planTier === "ultra" ? "管理方案" : "升级 Pro"} →
						</button>
					</div>
				</>
			) : (
				<div className="fold-account-plans">
					{PRO_PLANS.map((item) => (
						<button
							key={item.id}
							type="button"
							disabled={busy !== null}
							className={`fold-account-plan-option${planTier === "pro" ? " is-current" : ""}`}
							onClick={() => void selectPlan("pro")}
						>
							<div className="fold-account-plan-option-top">
								<span className="fold-account-plan-option-title">{item.title}</span>
								{planTier === "pro" && <Check size={14} strokeWidth={2} />}
							</div>
							<p className="fold-account-plan-option-price">
								{item.price}
								<span>{item.period}</span>
							</p>
							<p className="fold-account-plan-option-note">{item.note}</p>
						</button>
					))}
					<button
						type="button"
						disabled={busy !== null || planTier === "free"}
						className="fold-account-btn"
						onClick={() => void selectPlan("free")}
					>
						{busy === "plan" ? "切换中…" : "降回免费版"}
					</button>
					<p className="fold-account-quota-note">
						支付宝 / 微信自动续费将在知更内完成，不跳转其他产品。
					</p>
				</div>
			)}

			{message && <p className="fold-account-message">{message}</p>}
		</div>
	);
}

/** @deprecated Prefer AccountPopover; kept for any leftover imports. */
export { AccountPopover as AccountSection };
