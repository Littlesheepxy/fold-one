/**
 * memory-chain self-check — upsert 演替链 + receipt 持久化。
 * 用法：pnpm exec tsx packages/memory/src/memory-chain.self-check.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getDb } from "./episode.js";
import { listActiveMemories, upsertMemory } from "./memory.js";

const dataDir = mkdtempSync(join(tmpdir(), "fold-chain-"));

try {
	// 首次插入：无演替
	const v1 = upsertMemory(
		{ type: "entity.person", key: "jason", value: "v1", receipt: { from: "consolidate", date: "2026-07-17" } },
		dataDir,
	);
	assert.equal(v1.supersedes, null);
	assert.equal(v1.active, true);
	assert.deepEqual(JSON.parse(v1.receiptJson!), { from: "consolidate", date: "2026-07-17" });

	// 二次 upsert 同 key：演替
	const v2 = upsertMemory(
		{ type: "entity.person", key: "jason", value: "v2", receipt: { from: "consolidate", date: "2026-07-18" } },
		dataDir,
	);
	assert.notEqual(v2.id, v1.id);
	assert.equal(v2.supersedes, v1.id);
	assert.equal(v2.active, true);

	// 旧记录已退役且指向下游
	const conn = getDb(dataDir);
	const old = conn.prepare(`SELECT * FROM memories WHERE id = ?`).get(v1.id) as {
		active: number;
		superseded_by: string | null;
	};
	assert.equal(old.active, 0);
	assert.equal(old.superseded_by, v2.id);

	// listActiveMemories 只看到新的
	const actives = listActiveMemories("entity.person", dataDir);
	assert.equal(actives.length, 1);
	assert.equal(actives[0]!.id, v2.id);
	assert.equal(actives[0]!.value, "v2");

	// 三次演替：链条完整 v1 <- v2 <- v3
	const v3 = upsertMemory({ type: "entity.person", key: "jason", value: "v3" }, dataDir);
	assert.equal(v3.supersedes, v2.id);
	const chain = conn
		.prepare(`SELECT id, active, supersedes, superseded_by FROM memories WHERE type = 'entity.person' AND key = 'jason' ORDER BY created_at ASC`)
		.all() as Array<{ id: string; active: number; supersedes: string | null; superseded_by: string | null }>;
	assert.equal(chain.length, 3);
	assert.equal(chain[0]!.id, v1.id);
	assert.equal(chain[0]!.superseded_by, v2.id);
	assert.equal(chain[1]!.id, v2.id);
	assert.equal(chain[1]!.supersedes, v1.id);
	assert.equal(chain[1]!.superseded_by, v3.id);
	assert.equal(chain[2]!.id, v3.id);
	assert.equal(chain[2]!.active, 1);
	assert.equal(chain[2]!.superseded_by, null);

	// 不同 key 互不影响
	const other = upsertMemory({ type: "entity.person", key: "amy", value: "a1" }, dataDir);
	assert.equal(other.supersedes, null);
	assert.equal(listActiveMemories("entity.person", dataDir).length, 2);

	console.log("memory-chain self-check passed");
} finally {
	rmSync(dataDir, { recursive: true, force: true });
}
