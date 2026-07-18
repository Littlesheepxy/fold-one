import assert from "node:assert/strict";
import type { ActionPlan } from "@fold/ai";
import { validatePlan } from "./validator.js";

const plan: ActionPlan = {
	goal: "send",
	steps: [
		{
			id: "send",
			skill: "office.cli",
			args: {},
			retryable: false,
			timeout: 1000,
		},
	],
	validate: ["office.cli.exitOk"],
};

assert.equal(validatePlan(plan, []).ok, false, "missing planned step must fail");
assert.equal(
	validatePlan(
		plan,
		[
			{
				stepId: "send",
				skill: "office.cli",
				status: "success",
				output: { ok: true },
				durationMs: 1,
			},
		],
	).ok,
	true,
);

const unknown = validatePlan(
	{ ...plan, validate: ["feishu.message.sent"] },
	[
		{
			stepId: "send",
			skill: "office.cli",
			status: "success",
			output: { ok: true },
			durationMs: 1,
		},
	],
);
assert.equal(unknown.ok, false, "unknown rule must fail closed");
assert.match(unknown.checks[1]?.message ?? "", /Unknown validation rule/);

console.log("validator self-check passed");
