import type { ReactNode } from "react";
import { ACT_LABELS, actForStep, type OnboardingAct, type OnboardingStepId } from "../types";

function btnClass(...parts: (string | false | undefined)[]) {
	return parts.filter(Boolean).join(" ");
}

export function OnboardingShell({
	step,
	onBack,
	left,
	right,
	footer,
}: {
	step: OnboardingStepId;
	onBack?: () => void;
	left: ReactNode;
	right?: ReactNode;
	footer?: ReactNode;
}) {
	const act = actForStep(step);
	const acts: OnboardingAct[] = ["setup", "inherit", "experience", "depart"];

	return (
		<div className="fold-onboarding-root">
			<div className="fold-onboarding-window">
				<nav className="fold-onboarding-stepper" aria-label="引导进度">
					{acts.map((id, i) => (
						<span key={id} className="fold-onboarding-stepper-item">
							{i > 0 && <span className="fold-onboarding-stepper-sep">›</span>}
							<span className={id === act ? "is-active" : ""}>{ACT_LABELS[id]}</span>
						</span>
					))}
				</nav>
				<div className={`fold-onboarding-body${right ? " has-split" : ""}`}>
					<section className="fold-onboarding-left">
						{onBack ? (
							<button type="button" className="fold-onboarding-back" onClick={onBack}>
								← 返回
							</button>
						) : (
							<div className="fold-onboarding-back-spacer" />
						)}
						{left}
						{footer ? <div className="fold-onboarding-footer">{footer}</div> : null}
					</section>
					{right ? <aside className="fold-onboarding-right">{right}</aside> : null}
				</div>
			</div>
		</div>
	);
}

export function OnboardingPrimaryBtn({
	children,
	onClick,
	disabled,
	className,
}: {
	children: ReactNode;
	onClick: () => void;
	disabled?: boolean;
	className?: string;
}) {
	return (
		<button
			type="button"
			className={btnClass("fold-onboarding-btn primary", className)}
			onClick={onClick}
			disabled={disabled}
		>
			{children}
		</button>
	);
}

export function OnboardingSecondaryBtn({
	children,
	onClick,
	disabled,
}: {
	children: ReactNode;
	onClick: () => void;
	disabled?: boolean;
}) {
	return (
		<button
			type="button"
			className="fold-onboarding-btn secondary"
			onClick={onClick}
			disabled={disabled}
		>
			{children}
		</button>
	);
}
