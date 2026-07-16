import type { ReactNode } from "react";

export function OnboardingTitleRow({
	title,
	hotkey,
}: {
	title: string;
	hotkey?: ReactNode;
}) {
	return (
		<div className="fold-onboarding-title-row">
			<h1 className="fold-onboarding-title">{title}</h1>
			{hotkey ? <span className="fold-onboarding-kbd fold-onboarding-kbd--title">{hotkey}</span> : null}
		</div>
	);
}
