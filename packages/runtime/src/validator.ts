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
	const checks = plan.validate.map((rule) => {
		const fn = RULES[rule];
		const passed = fn ? fn(steps) : true;
		return { rule, passed, message: passed ? undefined : `Validation failed: ${rule}` };
	});
	return { ok: checks.every((c) => c.passed), checks };
}
