import { useEffect, useState, type ReactNode } from "react";
import {
	Check,
	Crown,
	LogOut,
	RefreshCw,
	Settings,
	Shield,
	TriangleAlert,
	X,
} from "lucide-react";
import { ZhigengLogoMark } from "./FoldLogo.js";
import type { FoldConfig, PlanTier } from "../types.js";

type Tab = "general" | "subscription" | "security";
export type AccountSettingsTab = Tab;
type BillingInterval = "month" | "year";

type AccountState = {
	signedIn: boolean;
	email?: string;
	name?: string;
	userId?: string;
	planTier: PlanTier;
	voiceSecondsRemaining?: number;
	smartActionsRemaining?: number;
	voiceSecondsLimit?: number;
	smartActionsLimit?: number;
	periodEnd?: string;
	syncedAt?: number;
};

const PLAN_LABEL: Record<PlanTier, { name: string; tagline: string }> = {
	free: { name: "免费版", tagline: "本地转写不限量 · 云端体验有限" },
	pro: { name: "Pro", tagline: "云端智能转写 600 分钟/月 · 智能代回" },
	ultra: { name: "升级版", tagline: "跨应用 Agent 与高级恢复" },
};

const FREE_FEATURES = [
	"本地转写不限量",
	"云端语音 30 分钟/月",
	"智能操作 20 次/月",
];

const PRO_FEATURES = [
	"云端智能转写 600 分钟/月",
	"智能操作 2000 次/月",
	"智能代回",
	"回到现场与记忆",
];

const BILLING = {
	month: {
		productId: "pro_monthly_cny",
		price: "¥29.9",
		period: "/月",
		anchor: "¥45.9",
		saveLabel: "立省 35%",
		note: "自动续费，可随时取消",
	},
	year: {
		productId: "pro_yearly_cny",
		price: "¥228",
		period: "/年",
		anchor: "¥358.8",
		saveLabel: "约合 ¥19/月 · 立省 36%",
		note: "比月付更划算，可随时取消",
	},
} as const;

function AccountCard({
	title,
	description,
	actions,
	children,
}: {
	title: string;
	description?: string;
	actions?: ReactNode;
	children: ReactNode;
}) {
	return (
		<section className="fold-account-card">
			<div className="fold-account-card-head">
				<div>
					<h3 className="fold-account-card-title">{title}</h3>
					{description && <p className="fold-account-card-desc">{description}</p>}
				</div>
				{actions}
			</div>
			<div className="fold-account-card-body">{children}</div>
		</section>
	);
}

function initials(name?: string, email?: string): string {
	const source = (name || email || "?").trim();
	if (!source) return "?";
	const parts = source.split(/\s+/).filter(Boolean);
	if (parts.length >= 2) return `${parts[0]![0]!}${parts[1]![0]!}`.toUpperCase();
	return source.slice(0, 2).toUpperCase();
}

function formatResetDate(periodEnd?: string): string | null {
	if (!periodEnd) return null;
	const d = new Date(periodEnd);
	if (Number.isNaN(d.getTime())) return null;
	return `${d.getFullYear()} 年 ${d.getMonth() + 1} 月 ${d.getDate()} 日重置`;
}

/** 单行额度：标签 + 进度条 + 数字 */
export function QuotaOneLine({
	label,
	remaining,
	limit,
	unit,
}: {
	label: string;
	remaining: number;
	limit: number;
	unit: string;
}) {
	const pct = limit > 0 ? Math.min(100, Math.round((remaining / limit) * 100)) : 0;
	return (
		<div className="fold-account-quota-oneline">
			<span className="fold-account-quota-oneline-label">{label}</span>
			<div className="fold-account-quota-oneline-bar" aria-hidden="true">
				<span style={{ width: `${pct}%` }} />
			</div>
			<span className="fold-account-quota-oneline-num">
				{remaining}/{limit} {unit}
			</span>
		</div>
	);
}

export function AccountSettingsModal({
	config,
	initialTab = "general",
	onClose,
	onConfigReload,
}: {
	config: FoldConfig;
	initialTab?: Tab;
	onClose: () => void;
	onConfigReload?: () => void | Promise<void>;
}) {
	const [tab, setTab] = useState<Tab>(initialTab);

	useEffect(() => {
		setTab(initialTab);
	}, [initialTab]);
	const [account, setAccount] = useState<AccountState>({
		signedIn: Boolean(config.accountUserId),
		email: config.accountEmail,
		name: config.accountName,
		userId: config.accountUserId,
		planTier: config.planTier ?? "free",
		voiceSecondsRemaining: config.voiceSecondsRemaining,
		smartActionsRemaining: config.smartActionsRemaining,
		voiceSecondsLimit: config.voiceSecondsLimit,
		smartActionsLimit: config.smartActionsLimit,
		periodEnd: config.periodEnd,
		syncedAt: config.accountSyncedAt,
	});
	const [email, setEmail] = useState("");
	const [code, setCode] = useState("");
	const [codeSent, setCodeSent] = useState(false);
	const [nameDraft, setNameDraft] = useState(config.accountName ?? "");
	const [busy, setBusy] = useState<string | null>(null);
	const [message, setMessage] = useState<string | null>(null);
	const [messageTone, setMessageTone] = useState<"success" | "error">("success");
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [billingInterval, setBillingInterval] = useState<BillingInterval>("year");

	const showError = (text: string) => {
		setMessage(text);
		setMessageTone("error");
	};
	const showSuccess = (text: string) => {
		setMessage(text);
		setMessageTone("success");
	};

	useEffect(() => {
		void window.fold.accountGetState().then((state) => {
			setAccount(state);
			setNameDraft(state.name ?? "");
		});
	}, []);

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			if (e.key === "Escape") onClose();
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [onClose]);

	const refresh = async (next: AccountState) => {
		setAccount(next);
		setNameDraft(next.name ?? "");
		await onConfigReload?.();
	};

	const plan = PLAN_LABEL[account.planTier ?? "free"];
	const voiceLimitSec =
		account.voiceSecondsLimit ??
		(account.planTier === "pro" || account.planTier === "ultra" ? 36000 : 1800);
	const voiceLimitMin = Math.floor(voiceLimitSec / 60);
	const voiceRemainingMin =
		typeof account.voiceSecondsRemaining === "number"
			? Math.max(0, Math.floor(account.voiceSecondsRemaining / 60))
			: null;
	const smartLimit = account.smartActionsLimit ?? (account.planTier === "pro" ? 2000 : 20);
	const smartRemaining =
		typeof account.smartActionsRemaining === "number" ? account.smartActionsRemaining : null;
	const resetLabel = formatResetDate(account.periodEnd);
	const billing = BILLING[billingInterval];
	const isPro = account.planTier === "pro" || account.planTier === "ultra";

	const requestCode = async () => {
		setBusy("code");
		setMessage(null);
		try {
			const result = await window.fold.accountRequestCode(email.trim());
			if (!result.ok) {
				showError(result.error);
				return;
			}
			setCodeSent(true);
			showSuccess(
				result.mode === "mock"
					? "已发送（本地 mock：验证码 888888）"
					: "验证码已发送，请查收邮箱",
			);
		} finally {
			setBusy(null);
		}
	};

	const verifyCode = async () => {
		setBusy("verify");
		setMessage(null);
		try {
			const result = await window.fold.accountVerifyCode({
				email: email.trim(),
				code: code.trim(),
			});
			if (!result.ok) {
				showError(result.error);
				return;
			}
			await refresh(result.state);
			showSuccess("登录成功");
			setTab("general");
		} finally {
			setBusy(null);
		}
	};

	const saveName = async () => {
		setBusy("name");
		setMessage(null);
		try {
			const result = await window.fold.accountUpdateName(nameDraft.trim());
			if (!result.ok) {
				showError(result.error);
				return;
			}
			await refresh({ ...account, name: nameDraft.trim() });
			showSuccess("昵称已更新");
		} finally {
			setBusy(null);
		}
	};

	const sync = async () => {
		setBusy("sync");
		setMessage(null);
		try {
			const state = await window.fold.accountSync();
			await refresh(state);
			showSuccess("权益已同步");
		} catch (error) {
			showError(error instanceof Error ? error.message : "同步失败");
		} finally {
			setBusy(null);
		}
	};

	const logout = async () => {
		setBusy("logout");
		try {
			const state = await window.fold.accountLogout();
			await refresh(state as AccountState);
			showSuccess("已退出登录");
		} finally {
			setBusy(null);
		}
	};

	const checkout = async (productId: string) => {
		setBusy("pay");
		setMessage(null);
		try {
			const result = await window.fold.accountCheckout({ productId });
			if (!result.ok) {
				showError(result.error);
				return;
			}
			if (result.checkoutUrl) {
				await window.fold.openExternal(result.checkoutUrl);
				showSuccess("已打开 Stripe 支付页，完成后点「同步权益」");
			} else {
				await refresh(result.state as AccountState);
				showSuccess(result.mode === "mock" ? "已开通 Pro（mock）" : "已提交");
			}
		} finally {
			setBusy(null);
		}
	};

	const cancel = async () => {
		setBusy("cancel");
		setMessage(null);
		try {
			const result = await window.fold.accountCancelPlan();
			if (!result.ok) {
				showError(result.error);
				return;
			}
			await refresh(result.state as AccountState);
			showSuccess("已取消订阅，回到免费版");
		} finally {
			setBusy(null);
		}
	};

	const removeAccount = async () => {
		setBusy("delete");
		setMessage(null);
		try {
			const result = await window.fold.accountDelete();
			if (!result.ok) {
				showError(result.error);
				return;
			}
			await refresh(result.state as AccountState);
			setConfirmDelete(false);
			showSuccess("账户已删除");
		} finally {
			setBusy(null);
		}
	};

	const tabs: Array<{ id: Tab; label: string; icon: typeof Settings }> = [
		{ id: "general", label: "通用", icon: Settings },
		{ id: "subscription", label: "订阅", icon: Crown },
		{ id: "security", label: "安全", icon: Shield },
	];

	return (
		<div className="fold-account-modal-backdrop" onClick={onClose} role="presentation">
			<div
				className={`fold-account-modal${account.signedIn ? " is-split" : ""}`}
				role="dialog"
				aria-modal="true"
				aria-label="账户设置"
				onClick={(e) => e.stopPropagation()}
			>
				<button
					type="button"
					className="fold-account-modal-close"
					onClick={onClose}
					aria-label="关闭"
				>
					<X size={16} strokeWidth={2} />
				</button>

				{!account.signedIn ? (
					<div className="fold-account-login">
						<div className="fold-account-login-mark" aria-hidden="true">
							<ZhigengLogoMark size={44} />
						</div>
						<p className="fold-account-login-title">登录知更账户</p>
						<p className="fold-account-quota-note">邮箱验证码登录，同步会员与云端配额</p>
						<input
							className="fold-account-input"
							type="email"
							placeholder="邮箱"
							value={email}
							onChange={(e) => setEmail(e.target.value)}
							autoComplete="email"
						/>
						{codeSent && (
							<input
								className="fold-account-input"
								type="text"
								inputMode="numeric"
								placeholder="6 位验证码"
								value={code}
								onChange={(e) => setCode(e.target.value)}
								autoComplete="one-time-code"
							/>
						)}
						{!codeSent ? (
							<button
								type="button"
								className="fold-account-btn primary"
								disabled={busy !== null || !email.trim()}
								onClick={() => void requestCode()}
							>
								{busy === "code" ? "发送中…" : "发送验证码"}
							</button>
						) : (
							<button
								type="button"
								className="fold-account-btn primary"
								disabled={busy !== null || code.trim().length < 4}
								onClick={() => void verifyCode()}
							>
								{busy === "verify" ? "登录中…" : "验证并登录"}
							</button>
						)}
						{codeSent && (
							<button
								type="button"
								className="fold-account-btn link"
								disabled={busy !== null}
								onClick={() => void requestCode()}
							>
								重新发送
							</button>
						)}
					</div>
				) : (
					<>
						<aside className="fold-account-sidebar">
							<div className="fold-account-sidebar-brand">账户设置</div>
							<nav className="fold-account-tabs" aria-label="账户分区">
								{tabs.map((item) => {
									const Icon = item.icon;
									return (
										<button
											key={item.id}
											type="button"
											className={`fold-account-tab${tab === item.id ? " is-active" : ""}`}
											onClick={() => setTab(item.id)}
										>
											<Icon size={15} strokeWidth={1.75} />
											{item.label}
										</button>
									);
								})}
							</nav>
						</aside>

						<div className="fold-account-content">
							<h2 className="fold-account-content-title">
								{tabs.find((x) => x.id === tab)?.label}
							</h2>
							<div className="fold-account-modal-body">
							{tab === "general" && (
								<>
									<AccountCard title="账户">
										<div className="fold-account-identity">
											<div className="fold-account-avatar" aria-hidden="true">
												{initials(account.name, account.email)}
											</div>
											<div className="min-w-0 flex-1">
												<p className="fold-account-identity-name">
													{account.name || account.email}
												</p>
												<p className="fold-account-identity-meta">{account.email}</p>
											</div>
											<span className={`fold-account-plan-pill is-${account.planTier}`}>
												{plan.name}
											</span>
										</div>
									</AccountCard>

									<AccountCard
										title="剩余额度"
										description={resetLabel ?? undefined}
										actions={
											<button
												type="button"
												className="fold-account-icon-btn"
												disabled={busy !== null}
												onClick={() => void sync()}
												aria-label="同步权益"
												title="同步权益"
											>
												<RefreshCw size={14} strokeWidth={2} className={busy === "sync" ? "is-spinning" : ""} />
											</button>
										}
									>
										<div className="fold-account-quota-stack">
											{voiceRemainingMin != null && (
												<QuotaOneLine
													label="云端"
													remaining={voiceRemainingMin}
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
									</AccountCard>

									<AccountCard title="个人资料" description="用于账户内显示的昵称">
										<div className="fold-account-inline-field">
											<input
												className="fold-account-input"
												value={nameDraft}
												onChange={(e) => setNameDraft(e.target.value)}
											/>
											<button
												type="button"
												className="fold-account-btn primary"
												disabled={busy !== null || !nameDraft.trim() || nameDraft.trim() === account.name}
												onClick={() => void saveName()}
											>
												{busy === "name" ? "保存中…" : "保存"}
											</button>
										</div>
									</AccountCard>
								</>
							)}

							{tab === "subscription" && (
								<>
									<div className="fold-account-billing-toggle" role="tablist" aria-label="计费周期">
										<button
											type="button"
											role="tab"
											aria-selected={billingInterval === "month"}
											className={billingInterval === "month" ? "is-active" : ""}
											onClick={() => setBillingInterval("month")}
										>
											月付
										</button>
										<button
											type="button"
											role="tab"
											aria-selected={billingInterval === "year"}
											className={billingInterval === "year" ? "is-active" : ""}
											onClick={() => setBillingInterval("year")}
										>
											年付
											<span className="fold-account-billing-save">更划算</span>
										</button>
									</div>

									<div className="fold-account-tier-grid">
										<div className={`fold-account-tier${!isPro ? " is-current" : ""}`}>
											{!isPro && <span className="fold-account-tier-chip">你当前的套餐</span>}
											<h4 className="fold-account-tier-name">免费版</h4>
											<p className="fold-account-tier-price">
												¥0<span>/月</span>
											</p>
											<p className="fold-account-tier-note">本地能力完整可用</p>
											<ul className="fold-account-plan-features">
												{FREE_FEATURES.map((feature) => (
													<li key={feature}>
														<Check size={12} strokeWidth={2.5} />
														{feature}
													</li>
												))}
											</ul>
										</div>

										<div className="fold-account-tier is-recommended">
											<span className="fold-account-plan-badge">
												<Crown size={11} strokeWidth={2} />
												推荐
											</span>
											{isPro && <span className="fold-account-tier-chip is-pro">已开通</span>}
											<h4 className="fold-account-tier-name">Pro</h4>
											<p className="fold-account-tier-price">
												<span className="fold-account-price-anchor">{billing.anchor}</span>
												{billing.price}
												<span>{billing.period}</span>
											</p>
											<p className="fold-account-tier-note">
												<span className="fold-account-save-pill">{billing.saveLabel}</span>
												{billing.note}
											</p>
											<ul className="fold-account-plan-features">
												{PRO_FEATURES.map((feature) => (
													<li key={feature}>
														<Check size={12} strokeWidth={2.5} />
														{feature}
													</li>
												))}
											</ul>
											{!isPro && (
												<button
													type="button"
													className="fold-account-btn primary"
													disabled={busy !== null}
													onClick={() => void checkout(billing.productId)}
												>
													{busy === "pay" ? "处理中…" : "升级 Pro"}
												</button>
											)}
										</div>
									</div>

									{isPro && (
										<button
											type="button"
											className="fold-account-btn link"
											disabled={busy !== null}
											onClick={() => void cancel()}
										>
											{busy === "cancel" ? "取消中…" : "取消订阅，回到免费版"}
										</button>
									)}
								</>
							)}

							{tab === "security" && (
								<>
									<div className="fold-account-plan-card">
										<p className="fold-account-plan-tagline">当前设备已登录</p>
										<p className="fold-account-quota-note">{account.email}</p>
										{account.syncedAt && (
											<p className="fold-account-quota-note">
												最近同步 {new Date(account.syncedAt).toLocaleString()}
											</p>
										)}
									</div>
									<button
										type="button"
										className="fold-account-btn"
										disabled={busy !== null}
										onClick={() => void logout()}
									>
										<LogOut size={13} strokeWidth={2} />
										{busy === "logout" ? "退出中…" : "退出登录"}
									</button>
									{!confirmDelete ? (
										<button
											type="button"
											className="fold-account-btn danger"
											disabled={busy !== null}
											onClick={() => setConfirmDelete(true)}
										>
											<TriangleAlert size={13} strokeWidth={2} />
											删除账户
										</button>
									) : (
										<div className="fold-account-danger-box">
											<p className="fold-account-quota-note">
												将永久删除账户与本地登录态，此操作不可恢复。
											</p>
											<div className="fold-account-pay-row">
												<button
													type="button"
													className="fold-account-btn danger"
													disabled={busy !== null}
													onClick={() => void removeAccount()}
												>
													{busy === "delete" ? "删除中…" : "确认删除"}
												</button>
												<button
													type="button"
													className="fold-account-btn"
													onClick={() => setConfirmDelete(false)}
												>
													取消
												</button>
											</div>
										</div>
									)}
								</>
							)}
							{message && (
								<p className={`fold-account-message is-${messageTone}`}>{message}</p>
							)}
							</div>
						</div>
					</>
				)}

				{!account.signedIn && message && (
					<p className={`fold-account-message is-${messageTone}`}>{message}</p>
				)}
			</div>
		</div>
	);
}
