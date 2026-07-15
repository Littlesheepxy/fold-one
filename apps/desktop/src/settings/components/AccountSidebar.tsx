import { ChevronUp, UserRound } from "lucide-react";
import type { FoldConfig, PlanTier } from "../types.js";

const PLAN_LABEL: Record<PlanTier, string> = {
	free: "免费版",
	pro: "付费版",
	ultra: "升级版",
};

export function AccountSidebar({
	config,
	active,
	onOpenAccount,
}: {
	config: FoldConfig;
	active: boolean;
	onOpenAccount: () => void;
}) {
	const planTier = config.planTier ?? "free";
	const planLabel = PLAN_LABEL[planTier];
	const trialRemaining = config.trialSmartActionsRemaining ?? 20;

	return (
		<div className="fold-home-sidebar-footer">
			<button
				type="button"
				onClick={onOpenAccount}
				className={`fold-home-account${active ? " is-active" : ""}`}
				aria-label="打开账户"
			>
				<div className="fold-home-account-avatar" aria-hidden="true">
					<UserRound size={16} strokeWidth={1.75} />
				</div>
				<div className="fold-home-account-copy min-w-0 flex-1 text-left">
					<p className="fold-home-account-name">本地用户</p>
					<p className="fold-home-account-meta">
						{planLabel}
						{planTier === "free" ? ` · 体验 ${trialRemaining} 次` : ""}
					</p>
				</div>
				<ChevronUp
					size={14}
					strokeWidth={1.75}
					className={`fold-home-account-chevron${active ? " is-open" : ""}`}
				/>
			</button>
		</div>
	);
}
