import { BrandIcon } from "../../settings/components/brand-icons";
import {
	ONBOARDING_SCENARIOS,
	type OnboardingScenarioId,
} from "../onboarding-scenarios";

export function ScenarioPicker({
	value,
	onChange,
}: {
	value: OnboardingScenarioId;
	onChange: (id: OnboardingScenarioId) => void;
}) {
	return (
		<div className="fold-onboarding-scenario-picker" role="tablist" aria-label="选择使用场景">
			{ONBOARDING_SCENARIOS.map((scenario) => (
				<button
					key={scenario.id}
					type="button"
					role="tab"
					aria-selected={value === scenario.id}
					className={value === scenario.id ? "is-active" : ""}
					onClick={() => onChange(scenario.id)}
				>
					<BrandIcon src={scenario.icon} size={16} alt="" />
					<span>{scenario.label}</span>
				</button>
			))}
		</div>
	);
}
