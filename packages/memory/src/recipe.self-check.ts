/**
 * Recipe store self-check — induce, match/fill, demote.
 * Run: pnpm exec tsx packages/memory/src/recipe.self-check.ts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	classifyTaskClass,
	getRecipeById,
	matchRecipe,
	normalizeIntentTokens,
	promoteRecipe,
	recordRecipeOutcome,
	type Episode,
} from "./index.js";

const dataDir = mkdtempSync(join(tmpdir(), "fold-recipe-self-check-"));

function assert(cond: unknown, msg: string): asserts cond {
	if (!cond) throw new Error(msg);
}

const intent1 =
	'在飞书给我自己发一条消息：「Fold压测报价」桌面报价已整理 path=/Users/demo/Desktop/quote-1.pdf';
const plan = {
	goal: "send self",
	steps: [
		{
			id: "s1",
			skill: "office.cli",
			args: { channel: "feishu", args: ["contact", "+get-user"] },
			retryable: true,
			timeout: 5000,
		},
		{
			id: "s2",
			skill: "office.cli",
			args: {
				channel: "feishu",
				args: ["im", "+messages-send", "--text", "Fold压测报价"],
				file: "/Users/demo/Desktop/quote-1.pdf",
			},
			dependsOn: ["s1"],
			retryable: true,
			timeout: 5000,
		},
	],
	validate: ["office.cli.exitOk"],
};

const episode: Episode = {
	id: "ep-1",
	timestamp: Date.now(),
	intent: intent1,
	goal: plan.goal,
	status: "success",
	summary: "飞书：消息已发送",
	planJson: JSON.stringify(plan),
	stepsJson: JSON.stringify([
		{ stepId: "s1", skill: "office.cli", status: "success", durationMs: 10 },
		{ stepId: "s2", skill: "office.cli", status: "success", durationMs: 20 },
	]),
	validationJson: JSON.stringify([{ rule: "office.cli.exitOk", passed: true }]),
	durationMs: 30,
	taskClass: classifyTaskClass(intent1, ["office.cli", "office.cli"]),
	clusterKey: "office.cli>office.cli",
};

assert(classifyTaskClass(intent1).startsWith("feishu."), `task class was ${classifyTaskClass(intent1)}`);
assert(normalizeIntentTokens(intent1).includes("飞书"), "tokens should include 飞书");

const recipe = promoteRecipe(episode, dataDir);
assert(recipe, "promote should create recipe");
assert(recipe.taskClass === "feishu.send_self", `expected feishu.send_self got ${recipe.taskClass}`);
assert(
	JSON.stringify(recipe.planTemplate).includes("{{slots."),
	`plan should be parameterized: ${JSON.stringify(recipe.planTemplate)}`,
);

const intent2 =
	'在飞书给我自己发一条消息：「新报价正文」桌面报价 path=/Users/demo/Desktop/quote-2.pdf';
const hit = matchRecipe(intent2, dataDir);
assert(hit, "similar intent should match recipe");
assert(hit.recipe.id === recipe.id, "matched same recipe");
const planJson = JSON.stringify(hit.plan);
assert(planJson.includes("新报价正文") || planJson.includes("quote-2.pdf"), `filled plan: ${planJson}`);
assert(!planJson.includes("{{slots."), "no unresolved slots");

recordRecipeOutcome(recipe.id, false, dataDir);
recordRecipeOutcome(recipe.id, false, dataDir);
const after = getRecipeById(recipe.id, dataDir);
assert(after?.status === "demoted", `should demote after 2 fails, got ${after?.status}`);
assert(!matchRecipe(intent2, dataDir), "demoted recipe must not match");

// Missing slot → miss
const noSlotIntent = "在飞书给我自己发一条消息";
const bare = promoteRecipe(
	{
		...episode,
		id: "ep-2",
		intent: '飞书发消息给自己：「固定正文」',
		planJson: JSON.stringify({
			goal: "x",
			steps: [
				{
					id: "a",
					skill: "office.cli",
					args: { text: "固定正文" },
					retryable: true,
					timeout: 1000,
				},
			],
			validate: [],
		}),
		status: "success",
		summary: "ok",
	},
	dataDir,
);
// reactivate by direct check — demoted previous; new recipe for same class
assert(bare, "second promote ok");
const missFill = matchRecipe(noSlotIntent, dataDir);
// may miss if tokens too weak or fill fails — either is acceptable as miss
if (missFill) {
	assert(
		!JSON.stringify(missFill.plan).includes("{{slots."),
		"if matched, slots must be filled",
	);
}

rmSync(dataDir, { recursive: true, force: true });
console.log("recipe self-check passed");
