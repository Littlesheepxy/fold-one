/**
 * fts self-check — context_events/episodes FTS5 全文检索。
 * 用法：pnpm exec tsx packages/memory/src/fts.self-check.ts
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { saveContextEvent, saveEpisode, searchContextEvents, searchEpisodes } from "./episode.js";

const dataDir = mkdtempSync(join(tmpdir(), "fold-fts-"));

try {
	saveContextEvent(
		{
			type: "clipboard.changed",
			source: "clipboard",
			timestamp: 1_700_000_000_000,
			data: { text: "Q3 报价单已更新，请查收", appName: "Mail", origin: "user" },
		},
		dataDir,
	);
	saveContextEvent(
		{
			type: "file.created",
			source: "finder",
			timestamp: 1_700_000_060_000,
			data: { filePath: "/Users/x/Downloads/合同终稿.pdf", appName: "Finder" },
		},
		dataDir,
	);
	saveContextEvent(
		{
			type: "app.active",
			source: "system",
			timestamp: 1_700_000_120_000,
			data: { appName: "Code", windowTitle: "episode.ts — fold" },
		},
		dataDir,
	);

	// 中文 ≥3 字符可命中（trigram）
	const hits = searchContextEvents("报价单", 5, dataDir);
	assert.equal(hits.length, 1, `hits=${hits.length}`);
	assert.equal(hits[0]!.row.type, "clipboard.changed");

	// 文件路径可命中
	const fileHits = searchContextEvents("合同终稿", 5, dataDir);
	assert.equal(fileHits.length, 1);
	assert.equal(fileHits[0]!.row.type, "file.created");

	// <3 字符的查询词被丢弃，返回空而不是报错
	assert.equal(searchContextEvents("报价", 5, dataDir).length, 0);

	// 不存在的词不命中
	assert.equal(searchContextEvents("不存在的词xyz", 5, dataDir).length, 0);

	// episodes FTS
	saveEpisode(
		{
			intent: "把刚下载的报价发给 Jason",
			goal: "发送报价单",
			plan: { validate: [], goal: "send", steps: [] },
			steps: [],
			status: "success",
		},
		dataDir,
	);
	const epHits = searchEpisodes("报价单", 5, dataDir);
	assert.equal(epHits.length, 1, `epHits=${epHits.length}`);
	assert.match(epHits[0]!.row.intent, /报价/);

	// FTS 操作符字符不应炸掉（转义生效）
	assert.doesNotThrow(() => searchContextEvents('"报价" OR (', 5, dataDir));

	console.log("fts self-check passed");
} finally {
	rmSync(dataDir, { recursive: true, force: true });
}
