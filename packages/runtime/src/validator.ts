import type { ActionPlan } from "@fold/ai";
import { collectSkillValidators } from "@fold/skills";
import type { StepResult } from "./types.js";

export interface ValidationResult {
	ok: boolean;
	checks: Array<{ rule: string; passed: boolean; message?: string }>;
}

// 验证规则的唯一出处是各 skill 的 manifest（packages/skills/src/registry.ts）。
const RULES = collectSkillValidators();

export function validatePlan(plan: ActionPlan, steps: StepResult[]): ValidationResult {
	const plannedStepsPassed = plan.steps.every((planned) =>
		steps.some((step) => step.stepId === planned.id && step.status === "success"),
	);
	const checks: ValidationResult["checks"] = [
		{
			rule: "plan.steps.completed",
			passed: plannedStepsPassed,
			message: plannedStepsPassed ? undefined : "Validation failed: not all planned steps completed",
		},
	];
	checks.push(...plan.validate.map((rule) => {
		const fn: ((input: StepResult[]) => boolean) | undefined = Object.prototype.hasOwnProperty.call(
			RULES,
			rule,
		)
			? RULES[rule]
			: undefined;
		const passed = fn ? fn(steps) : false;
		return {
			rule,
			passed,
			message: passed
				? undefined
				: fn
					? `Validation failed: ${rule}`
					: `Unknown validation rule: ${rule}`,
		};
	}));
	return { ok: checks.every((c) => c.passed), checks };
}
