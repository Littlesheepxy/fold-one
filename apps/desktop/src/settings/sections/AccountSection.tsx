import { useState } from "react";
import { Crown } from "lucide-react";
import type { FoldConfig, PlanTier } from "../types.js";

const PLAN_OPTIONS: Array<{
	tier: PlanTier;
	name: string;
	tagline: string;
}> = [
	{
		tier: "free",
		name: "免费版",
		tagline: "本地语音、Context、基础净化",
	},
	{
		tier: "pro",
		name: "付费版",
		tagline: "云端识别、热词、情境代回",
	},
	{
		tier: "ultra",
		name: "升级版",
		tagline: "跨应用 Agent 与高级恢复",
	},
];

export function AccountSection({
	config,
	onUpdate,
}: {
	config: FoldConfig;
	onUpdate: (key: keyof FoldConfig, value: string) => void;
}) {
	const [planSaving, setPlanSaving] = useState<PlanTier | null>(null);
	const [planMessage, setPlanMessage] = useState<string | null>(null);

	const planTier = config.planTier ?? "free";
	const currentPlan = PLAN_OPTIONS.find((plan) => plan.tier === planTier) ?? PLAN_OPTIONS[0];

	const handlePlanChange = async (nextTier: PlanTier) => {
		if (nextTier === planTier || planSaving) return;
		setPlanSaving(nextTier);
		setPlanMessage(null);
		try {
			await window.fold.saveConfig({ ...config, planTier: nextTier });
			onUpdate("planTier", nextTier);
			setPlanMessage(
				nextTier === "free"
					? "已切换为免费版"
					: "已切换会员方案。支付与账号绑定即将开放，当前为预览体验。",
			);
		} finally {
			setPlanSaving(null);
		}
	};

	return (
		<div className="space-y-5">
			<div>
				<h1 className="fold-home-page-title">账户</h1>
				<p className="fold-home-page-subtitle">管理会员方案与账户信息</p>
			</div>

			<div className="fold-home-group">
				<div className="fold-home-group-head">
					<div className="fold-home-icon-tile">
						<Crown size={18} strokeWidth={1.75} />
					</div>
					<span className="fold-home-group-title">当前方案</span>
				</div>

				<div className="rounded-xl border border-black/8 bg-black/2.5 px-3.5 py-3">
					<div className="flex items-center justify-between gap-3">
						<div>
							<p className="text-[13px] font-semibold text-[#1d1d1f]">{currentPlan.name}</p>
							<p className="mt-1 text-[11px] leading-relaxed text-[#6e6e73]">
								{currentPlan.tagline}
							</p>
						</div>
						<span className="shrink-0 rounded-full bg-[#0071e3]/10 px-2.5 py-1 text-[11px] font-medium text-[#0071e3]">
							当前
						</span>
					</div>
					{planTier === "free" && (
						<p className="mt-2.5 text-[11px] font-medium text-[#0071e3]">
							剩余智能体验：{config.trialSmartActionsRemaining ?? 20} 次
						</p>
					)}
				</div>

				<div className="space-y-2">
					<p className="px-1 text-[11px] font-medium text-[#86868b]">变更方案</p>
					<div className="fold-home-plan-grid">
						{PLAN_OPTIONS.map((plan) => {
							const isCurrent = plan.tier === planTier;
							const isUpgrade = plan.tier !== "free" && planTier === "free";
							return (
								<div
									key={plan.tier}
									className={`fold-home-plan-card${isCurrent ? " is-current" : ""}`}
								>
									<div className="min-w-0">
										<p className="fold-home-plan-card-title">{plan.name}</p>
										<p className="fold-home-plan-card-desc">{plan.tagline}</p>
									</div>
									<button
										type="button"
										disabled={isCurrent || planSaving !== null}
										onClick={() => void handlePlanChange(plan.tier)}
										className={`fold-home-plan-switch${
											isUpgrade ? " fold-home-plan-switch-primary" : ""
										}`}
									>
										{planSaving === plan.tier
											? "切换中…"
											: isCurrent
												? "当前"
												: plan.tier === "free"
													? "切换"
													: "升级"}
									</button>
								</div>
							);
						})}
					</div>
					{planTier === "free" && (
						<button
							type="button"
							onClick={() => void window.fold.openExternal("https://foldhub.cn")}
							className="fold-home-link"
						>
							了解会员权益与定价 →
						</button>
					)}
					{planMessage && (
						<p className="px-1 text-[11px] leading-relaxed text-[#6e6e73]">{planMessage}</p>
					)}
				</div>
			</div>

			<div className="rounded-xl border border-black/8 bg-black/2.5 px-3.5 py-3">
				<p className="text-[13px] font-semibold text-[#1d1d1f]">登录与同步</p>
				<p className="mt-1 text-[11px] leading-relaxed text-[#86868b]">
					账号登录、云端同步与支付即将开放。当前设备以本地账户运行。
				</p>
			</div>
		</div>
	);
}
