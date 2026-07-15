import type { ReactNode } from "react";
import { ACT_LABELS, actForStep, type OnboardingAct, type OnboardingStepId } from "../types";

function btnClass(...parts: (string | false | undefined)[]) {
	return parts.filter(Boolean).join(" ");
}

export type OnboardingBackdrop = "memory" | "context";

const MEMORY_GHOST_LINES = [
	"明早十点发群里",
	"辛苦帮忙看下这版",
	"我们九点半开始对一下",
	"Q3 预算评审纪要",
	"周五前发你完整版",
	"抄送晓明",
];

function OnboardingBackdropLayer({ variant }: { variant: OnboardingBackdrop }) {
	if (variant === "memory") {
		return (
			<div className="fold-onboarding-backdrop fold-onboarding-backdrop--memory" aria-hidden="true">
				{MEMORY_GHOST_LINES.map((line, i) => (
					<span key={line} className={`fold-onboarding-backdrop-line is-${i + 1}`}>
						{line}
					</span>
				))}
			</div>
		);
	}
	return (
		<div className="fold-onboarding-backdrop fold-onboarding-backdrop--context" aria-hidden="true">
			<div className="fold-onboarding-backdrop-window is-1">
				<span />
				<p>飞书 · Q3 预算评审</p>
			</div>
			<div className="fold-onboarding-backdrop-window is-2">
				<span />
				<p>Cursor · onboarding.tsx</p>
			</div>
		</div>
	);
}

export function OnboardingShell({
	step,
	onBack,
	left,
	right,
	footer,
	backdrop,
}: {
	step: OnboardingStepId;
	onBack?: () => void;
	left: ReactNode;
	right?: ReactNode;
	footer?: ReactNode;
	backdrop?: OnboardingBackdrop;
}) {
	const act = actForStep(step);
	const acts: OnboardingAct[] = ["setup", "inherit", "experience", "depart"];

	return (
		<div className="fold-onboarding-root">
			<div className={`fold-onboarding-window${backdrop ? " has-backdrop" : ""}`}>
				{backdrop ? <OnboardingBackdropLayer variant={backdrop} /> : null}
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
