/**
 * Procedural recipe store — success-gated, task-class keyed, lexical match.
 * ponytail: no embedding; upgrade path when active >= ~80 and same-class miss rate is measurable.
 */
import { randomUUID } from "node:crypto";
import type { ActionPlan } from "@fold/ai";
import { getDb, type Episode } from "./episode.js";
import {
	classifyTaskClass,
	clusterKeyFromSkills,
	jaccard,
	normalizeIntentTokens,
} from "./task-shape.js";

export {
	classifyTaskClass,
	clusterKeyFromSkills,
	jaccard,
	normalizeIntentTokens,
} from "./task-shape.js";

const JACCARD_THRESHOLD = 0.45;
const DEMOTE_AFTER_FAILS = 2;

export type RecipeStatus = "active" | "demoted";

export interface Recipe {
	id: string;
	taskClass: string;
	clusterKey: string;
	intentTokens: string[];
	planTemplate: ActionPlan;
	slots: Record<string, string>;
	sourceEpisodeIds: string[];
	successCount: number;
	failCount: number;
	status: RecipeStatus;
	createdAt: number;
	updatedAt: number;
}

export interface RecipeDraft {
	taskClass: string;
	clusterKey: string;
	intentTokens: string[];
	planTemplate: ActionPlan;
	slots: Record<string, string>;
}

export interface MatchedRecipe {
	recipe: Recipe;
	score: number;
	plan: ActionPlan;
}

type RecipeRow = {
	id: string;
	task_class: string;
	cluster_key: string;
	intent_tokens: string;
	plan_template_json: string;
	slots_json: string;
	source_episode_ids: string;
	success_count: number;
	fail_count: number;
	status: string;
	created_at: number;
	updated_at: number;
};

function ensureRecipesTable(dataDir?: string): void {
	const conn = getDb(dataDir);
	conn.exec(`
		CREATE TABLE IF NOT EXISTS recipes (
			id TEXT PRIMARY KEY,
			task_class TEXT NOT NULL,
			cluster_key TEXT NOT NULL,
			intent_tokens TEXT NOT NULL,
			plan_template_json TEXT NOT NULL,
			slots_json TEXT NOT NULL DEFAULT '{}',
			source_episode_ids TEXT NOT NULL DEFAULT '[]',
			success_count INTEGER NOT NULL DEFAULT 1,
			fail_count INTEGER NOT NULL DEFAULT 0,
			status TEXT NOT NULL DEFAULT 'active',
			created_at INTEGER NOT NULL,
			updated_at INTEGER NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_recipes_task_class_status ON recipes(task_class, status);
	`);
}

function mapRow(row: RecipeRow): Recipe {
	return {
		id: row.id,
		taskClass: row.task_class,
		clusterKey: row.cluster_key,
		intentTokens: JSON.parse(row.intent_tokens) as string[],
		planTemplate: JSON.parse(row.plan_template_json) as ActionPlan,
		slots: JSON.parse(row.slots_json) as Record<string, string>,
		sourceEpisodeIds: JSON.parse(row.source_episode_ids) as string[],
		successCount: row.success_count,
		failCount: row.fail_count,
		status: row.status === "demoted" ? "demoted" : "active",
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	};
}

const PATH_RE = /(?:\/Users\/[^\s"'，。]+|(?:~\/)?(?:Desktop|Downloads|Documents)\/[^\s"'，。]+)/g;
const ISO_RE = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?/g;
const QUOTED_RE = /[「“\"]([^「」“”\"]{2,120})[」”\"]/g;
const PERSON_RE = /(?:发给|回复|联系|找|告诉|通知)\s*([A-Za-z\u4e00-\u9fa5]{2,12})/g;

/** Extract concrete slot values from intent text. */
export function extractSlotsFromIntent(intent: string): Record<string, string> {
	const slots: Record<string, string> = {};
	let i = 0;
	for (const m of intent.matchAll(PATH_RE)) {
		slots[`path_${i++}`] = m[0];
	}
	i = 0;
	for (const m of intent.matchAll(ISO_RE)) {
		slots[`time_${i++}`] = m[0];
	}
	i = 0;
	for (const m of intent.matchAll(QUOTED_RE)) {
		if (!m[1]) continue;
		slots[`quoted_${i++}`] = m[1];
	}
	i = 0;
	for (const m of intent.matchAll(PERSON_RE)) {
		const name = m[1];
		if (!name || /^(我自己|自己|本人)$/.test(name)) continue;
		slots[`person_${i++}`] = name;
	}
	// Colon body for self-message style intents
	const afterColon = intent.match(
		/(?:消息|信息|说明|标题)\s*[:：]\s*(.+)$/,
	);
	if (afterColon?.[1]?.trim() && !slots.quoted_0) {
		slots.text_0 = afterColon[1].trim();
	}
	return slots;
}

function replaceLiteralsInJson(plan: ActionPlan, slots: Record<string, string>): ActionPlan {
	let json = JSON.stringify(plan);
	// Longer values first so nested paths don't partially replace
	const entries = Object.entries(slots).sort((a, b) => b[1].length - a[1].length);
	for (const [name, value] of entries) {
		if (!value || value.length < 2) continue;
		const needle = JSON.stringify(value).slice(1, -1); // escaped string body
		if (!json.includes(needle)) continue;
		json = json.split(needle).join(`{{slots.${name}}}`);
	}
	return JSON.parse(json) as ActionPlan;
}

function fillSlotsInJson(plan: ActionPlan, slots: Record<string, string>): ActionPlan | null {
	let json = JSON.stringify(plan);
	const needed = [...json.matchAll(/\{\{slots\.([a-zA-Z0-9_]+)\}\}/g)]
		.map((m) => m[1])
		.filter((name): name is string => Boolean(name));
	for (const name of needed) {
		const value = slots[name];
		if (value === undefined || value === "") return null;
		json = json.split(`{{slots.${name}}}`).join(JSON.stringify(value).slice(1, -1));
	}
	return JSON.parse(json) as ActionPlan;
}

export function induceRecipeFromEpisode(episode: Episode): RecipeDraft | null {
	if (!["success", "recovered"].includes(episode.status)) return null;
	let plan: ActionPlan;
	try {
		plan = JSON.parse(episode.planJson) as ActionPlan;
	} catch {
		return null;
	}
	if (!plan.steps?.length) return null;

	const skills = plan.steps.map((s) => s.skill);
	const clusterKey = clusterKeyFromSkills(skills);
	const taskClass = classifyTaskClass(episode.intent, skills);
	const slots = extractSlotsFromIntent(episode.intent);
	if (Object.keys(slots).length === 0) return null;
	const planTemplate = replaceLiteralsInJson(plan, slots);
	// Must actually parameterize something — otherwise not reusable
	if (!JSON.stringify(planTemplate).includes("{{slots.")) return null;

	return {
		taskClass,
		clusterKey,
		intentTokens: normalizeIntentTokens(episode.intent),
		planTemplate,
		slots,
	};
}

function skillSignatureCompatible(recipeKey: string, candidateKey: string): boolean {
	if (recipeKey === candidateKey) return true;
	if (!recipeKey || !candidateKey) return false;
	const a = recipeKey.split(">");
	const b = candidateKey.split(">");
	if (a.length <= b.length && a.every((s, i) => s === b[i])) return true;
	if (b.length <= a.length && b.every((s, i) => s === a[i])) return true;
	return false;
}

export function listActiveRecipes(taskClass: string, dataDir?: string): Recipe[] {
	ensureRecipesTable(dataDir);
	const rows = getDb(dataDir)
		.prepare(
			`SELECT * FROM recipes WHERE status = 'active' AND task_class = ? ORDER BY success_count DESC`,
		)
		.all(taskClass) as RecipeRow[];
	return rows.map(mapRow);
}

export function listAllRecipes(dataDir?: string): Recipe[] {
	ensureRecipesTable(dataDir);
	return (getDb(dataDir).prepare(`SELECT * FROM recipes`).all() as RecipeRow[]).map(mapRow);
}

export function promoteRecipe(episode: Episode, dataDir?: string): Recipe | null {
	if (!isEpisodeEligibleForRecipe(episode)) return null;
	const draft = induceRecipeFromEpisode(episode);
	if (!draft) return null;

	ensureRecipesTable(dataDir);
	const conn = getDb(dataDir);
	const existing = listActiveRecipes(draft.taskClass, dataDir);
	const tokens = draft.intentTokens;
	let best: Recipe | null = null;
	let bestScore = 0;
	for (const r of existing) {
		if (!skillSignatureCompatible(r.clusterKey, draft.clusterKey)) continue;
		const score = jaccard(tokens, r.intentTokens);
		if (score >= JACCARD_THRESHOLD && score > bestScore) {
			best = r;
			bestScore = score;
		}
	}

	const now = Date.now();
	if (best) {
		const ids = [...new Set([...best.sourceEpisodeIds, episode.id])];
		conn
			.prepare(
				`UPDATE recipes SET success_count = success_count + 1, source_episode_ids = ?, updated_at = ? WHERE id = ?`,
			)
			.run(JSON.stringify(ids), now, best.id);
		return { ...best, successCount: best.successCount + 1, sourceEpisodeIds: ids, updatedAt: now };
	}

	const id = randomUUID();
	conn
		.prepare(
			`INSERT INTO recipes (
				id, task_class, cluster_key, intent_tokens, plan_template_json, slots_json,
				source_episode_ids, success_count, fail_count, status, created_at, updated_at
			) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, 'active', ?, ?)`,
		)
		.run(
			id,
			draft.taskClass,
			draft.clusterKey,
			JSON.stringify(draft.intentTokens),
			JSON.stringify(draft.planTemplate),
			JSON.stringify(draft.slots),
			JSON.stringify([episode.id]),
			now,
			now,
		);
	return {
		id,
		taskClass: draft.taskClass,
		clusterKey: draft.clusterKey,
		intentTokens: draft.intentTokens,
		planTemplate: draft.planTemplate,
		slots: draft.slots,
		sourceEpisodeIds: [episode.id],
		successCount: 1,
		failCount: 0,
		status: "active",
		createdAt: now,
		updatedAt: now,
	};
}

export function isEpisodeEligibleForRecipe(episode: Episode): boolean {
	if (!["success", "recovered"].includes(episode.status)) return false;
	const result = `${episode.summary}\n${episode.resultDetail ?? ""}`;
	if (/发送已跳过|未确认/.test(result)) return false;
	if (episode.validationJson) {
		try {
			const checks = JSON.parse(episode.validationJson) as Array<{ passed?: boolean }>;
			if (checks.some((c) => c.passed === false)) return false;
		} catch {
			/* ignore */
		}
	}
	if (episode.stepsJson) {
		try {
			const steps = JSON.parse(episode.stepsJson) as Array<{ status?: string }>;
			if (steps.some((s) => s.status && s.status !== "success")) return false;
		} catch {
			/* ignore */
		}
	}
	return true;
}

export function fillRecipePlan(template: ActionPlan, intent: string): ActionPlan | null {
	const slots = extractSlotsFromIntent(intent);
	return fillSlotsInJson(template, slots);
}

export function matchRecipe(intent: string, dataDir?: string): MatchedRecipe | null {
	ensureRecipesTable(dataDir);
	const taskClass = classifyTaskClass(intent);
	const adjacent =
		taskClass.endsWith(".other") ? [taskClass] : [taskClass, `${taskClass.split(".")[0]}.other`];
	const tokens = normalizeIntentTokens(intent);
	let best: MatchedRecipe | null = null;

	for (const tc of adjacent) {
		for (const recipe of listActiveRecipes(tc, dataDir)) {
			const score = jaccard(tokens, recipe.intentTokens);
			if (score < JACCARD_THRESHOLD) continue;
			if (best && (score < best.score || (score === best.score && recipe.successCount <= best.recipe.successCount)))
				continue;
			const plan = fillRecipePlan(recipe.planTemplate, intent);
			if (!plan) continue;
			best = { recipe, score, plan };
		}
	}
	return best;
}

export function recordRecipeOutcome(id: string, ok: boolean, dataDir?: string): void {
	ensureRecipesTable(dataDir);
	const conn = getDb(dataDir);
	const row = conn.prepare(`SELECT * FROM recipes WHERE id = ?`).get(id) as RecipeRow | undefined;
	if (!row) return;
	const now = Date.now();
	if (ok) {
		conn
			.prepare(`UPDATE recipes SET success_count = success_count + 1, updated_at = ? WHERE id = ?`)
			.run(now, id);
		return;
	}
	const failCount = row.fail_count + 1;
	const status = failCount >= DEMOTE_AFTER_FAILS ? "demoted" : row.status;
	conn
		.prepare(`UPDATE recipes SET fail_count = ?, status = ?, updated_at = ? WHERE id = ?`)
		.run(failCount, status, now, id);
}

export function getRecipeById(id: string, dataDir?: string): Recipe | null {
	ensureRecipesTable(dataDir);
	const row = getDb(dataDir).prepare(`SELECT * FROM recipes WHERE id = ?`).get(id) as
		| RecipeRow
		| undefined;
	return row ? mapRow(row) : null;
}
