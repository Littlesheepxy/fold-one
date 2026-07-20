/**
 * affinity self-check — seed episodes, assert office/agent ranking.
 * 用法：node --import tsx packages/memory/src/affinity.self-check.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	pickPreferredAgent,
	rankAgents,
	rankOfficeChannels,
	scoreOfficeAffinity,
} from "./affinity.js";
import { saveEpisode } from "./episode.js";

const dataDir = mkdtempSync(join(tmpdir(), "fold-affinity-"));

try {
	const plan = { goal: "t", steps: [] as [] };
	// 钉钉成功 3 次、飞书 1 次 → 钉钉应排前
	for (let i = 0; i < 3; i++) {
		saveEpisode(
			{
				intent: "在钉钉给我自己发一条消息：亲和度压测",
				goal: "send",
				plan,
				steps: [{ stepId: "1", skill: "office.cli", status: "success", durationMs: 1 }],
				status: "success",
			},
			dataDir,
		);
	}
	saveEpisode(
		{
			intent: "在飞书给我自己发一条消息：亲和度压测",
			goal: "send",
			plan,
			steps: [{ stepId: "1", skill: "office.cli", status: "success", durationMs: 1 }],
			status: "success",
		},
		dataDir,
	);

	const officeScores = scoreOfficeAffinity(dataDir);
	assert.equal(officeScores.dingtalk, 3, `dingtalk=${officeScores.dingtalk}`);
	assert.equal(officeScores.feishu, 1, `feishu=${officeScores.feishu}`);
	assert.deepEqual(
		rankOfficeChannels(["feishu", "dingtalk", "wecom"], dataDir),
		["dingtalk", "feishu", "wecom"],
	);

	// codex 2 成功、claude-code 1 失败 → codex 优先；显式 preferred 压过亲和度
	saveEpisode(
		{
			intent: "修一下这个 bug",
			goal: "code",
			plan: {
				goal: "code",
				steps: [{ id: "a", skill: "agent.execute", args: { agent: "codex", brief: "x" } }],
			},
			steps: [{ stepId: "a", skill: "agent.execute", status: "success", durationMs: 10 }],
			status: "success",
			agentEvents: [{ source: "codex", type: "done", message: "ok" }],
		},
		dataDir,
	);
	saveEpisode(
		{
			intent: "再修一下",
			goal: "code",
			plan: {
				goal: "code",
				steps: [{ id: "a", skill: "agent.execute", args: { agent: "codex", brief: "x" } }],
			},
			steps: [{ stepId: "a", skill: "agent.execute", status: "success", durationMs: 10 }],
			status: "success",
			agentEvents: [{ source: "codex", type: "done", message: "ok" }],
		},
		dataDir,
	);
	saveEpisode(
		{
			intent: "换个 agent 修",
			goal: "code",
			plan: {
				goal: "code",
				steps: [
					{ id: "a", skill: "agent.execute", args: { agent: "claude-code", brief: "x" } },
				],
			},
			steps: [{ stepId: "a", skill: "agent.execute", status: "failed", durationMs: 10 }],
			status: "partial",
			agentEvents: [{ source: "claude-code", type: "failed", message: "nope" }],
		},
		dataDir,
	);

	const ranked = rankAgents(["claude-code", "codex", "cursor"], dataDir);
	assert.equal(ranked[0], "codex", `ranked=${ranked.join(",")}`);
	assert.equal(
		pickPreferredAgent(["claude-code", "codex"], { dataDir }),
		"codex",
	);
	assert.equal(
		pickPreferredAgent(["claude-code", "codex"], {
			preferred: "claude-code",
			dataDir,
		}),
		"claude-code",
	);
	assert.equal(
		pickPreferredAgent(["claude-code", "codex"], { preferred: "auto", dataDir }),
		"codex",
	);

	console.log("affinity self-check passed");
} finally {
	rmSync(dataDir, { recursive: true, force: true });
}
