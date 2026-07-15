import { generateFastText, hasFastModelApiKey } from "@fold/ai";
import {
	getDb,
	listContextEventsInRange,
	listEpisodesInRange,
	type ContextEventRow,
	type Episode,
} from "./episode.js";
import { listActiveMemories, upsertMemory } from "./memory.js";

const META_LAST_DATE_KEY = "meta.lastConsolidatedDate";
const MAX_CATCHUP_DAYS = 7;
const RAW_RETENTION_DAYS = 14;
const CLIPBOARD_KEEP_COUNT = 200;

const FOLLOW_UP_PATTERN = /待办|提醒|跟进|答应|截止|之前|发给|回复|提交/i;
const PERSON_HINT_PATTERN = /(?:发给|回复|联系|找|跟|告诉|通知)\s*([A-Za-z\u4e00-\u9fa5]{2,12})/g;

export interface DayAggregate {
	dateKey: string;
	topFiles: Array<{ path: string; name: string; count: number }>;
	topApps: Array<{ app: string; count: number }>;
	topUrls: Array<{ url: string; title?: string; count: number }>;
	clipboardSnippets: string[];
	episodes: Array<{
		id: string;
		intent: string;
		status: string;
		summary: string;
	}>;
	personHints: string[];
}

export interface PersonDigest {
	key: string;
	name: string;
	role?: string;
	commitment?: string;
	projectKeys?: string[];
	episodeIds: string[];
}

export interface ProjectDigest {
	key: string;
	name: string;
	status?: string;
	nextStep?: string;
	personKeys?: string[];
	filePaths?: string[];
	episodeIds: string[];
}

export interface DayDigest {
	dateKey: string;
	summary: string;
	highlights: string[];
	people: PersonDigest[];
	projects: ProjectDigest[];
	selfNote?: string;
}

export interface PersonMemoryValue {
	name: string;
	role?: string;
	commitment?: string;
	projectKeys?: string[];
	episodeIds: string[];
	lastSeenDate: string;
	history?: Array<{ date: string; note: string }>;
}

export interface ProjectMemoryValue {
	name: string;
	status?: string;
	nextStep?: string;
	personKeys?: string[];
	filePaths?: string[];
	episodeIds: string[];
	lastActiveDate: string;
	history?: Array<{ date: string; note: string }>;
}

export interface DayDigestValue {
	date: string;
	summary: string;
	highlights: string[];
	topApps: string[];
	episodeCount: number;
}

export type MemoryEntityRecord =
	| {
			id: string;
			type: "entity.person";
			key: string;
			value: PersonMemoryValue;
			confidence: number;
			updatedAt: number;
	  }
	| {
			id: string;
			type: "entity.project";
			key: string;
			value: ProjectMemoryValue;
			confidence: number;
			updatedAt: number;
	  };

export function slugEntityKey(name: string): string {
	const trimmed = name.trim().toLowerCase();
	const ascii = trimmed.replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-").replace(/^-|-$/g, "");
	return ascii || "unknown";
}

export function dateKeyFromMs(ts: number): string {
	const d = new Date(ts);
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	return `${y}-${m}-${day}`;
}

export function dayBoundsMs(dateKey: string): { start: number; end: number } {
	const parts = dateKey.split("-").map(Number);
	const y = parts[0] ?? 1970;
	const m = parts[1] ?? 1;
	const d = parts[2] ?? 1;
	const start = new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
	return { start, end: start + 86_400_000 - 1 };
}

export function yesterdayDateKey(): string {
	const d = new Date();
	d.setDate(d.getDate() - 1);
	return dateKeyFromMs(d.getTime());
}

function addDays(dateKey: string, delta: number): string {
	const { start } = dayBoundsMs(dateKey);
	return dateKeyFromMs(start + delta * 86_400_000);
}

function shortPath(p: string): string {
	return p.replace(/^\/Users\/[^/]+/, "~");
}

function bumpCount<T extends string>(map: Map<T, number>, key: T) {
	map.set(key, (map.get(key) ?? 0) + 1);
}

function topEntries<T extends string>(map: Map<T, number>, limit = 8): Array<{ key: T; count: number }> {
	return [...map.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, limit)
		.map(([key, count]) => ({ key, count }));
}

export function aggregateDay(
	events: ContextEventRow[],
	episodes: Episode[],
	dateKey: string,
): DayAggregate {
	const fileCounts = new Map<string, { path: string; name: string; count: number }>();
	const appCounts = new Map<string, number>();
	const urlCounts = new Map<string, { url: string; title?: string; count: number }>();
	const clipboardSnippets: string[] = [];
	const personHints = new Set<string>();

	for (const event of events) {
		if (event.type === "app.active") {
			const app = typeof event.data.appName === "string" ? event.data.appName : "";
			if (app) bumpCount(appCounts, app);
		}
		if (event.type === "file.created" || event.type === "file.modified") {
			const path = typeof event.data.filePath === "string" ? event.data.filePath : "";
			if (!path) continue;
			const existing = fileCounts.get(path) ?? { path, name: path.split("/").pop() ?? path, count: 0 };
			existing.count += 1;
			fileCounts.set(path, existing);
		}
		if (event.type === "browser.urlChanged") {
			const url = typeof event.data.url === "string" ? event.data.url : "";
			if (!url) continue;
			const title = typeof event.data.windowTitle === "string" ? event.data.windowTitle : undefined;
			const existing = urlCounts.get(url) ?? { url, title, count: 0 };
			existing.count += 1;
			urlCounts.set(url, existing);
		}
		if (event.type === "clipboard.changed" && event.data.origin !== "fold") {
			const text = typeof event.data.text === "string" ? event.data.text.trim() : "";
			if (text.length >= 4 && !clipboardSnippets.includes(text)) {
				clipboardSnippets.push(text.slice(0, 120));
			}
		}
	}

	const episodeRows = episodes.map((ep) => {
		const text = `${ep.intent} ${ep.summary}`;
		for (const match of text.matchAll(PERSON_HINT_PATTERN)) {
			const name = match[1]?.trim();
			if (name && name.length >= 2) personHints.add(name);
		}
		return {
			id: ep.id,
			intent: ep.intent,
			status: ep.status,
			summary: ep.summary,
		};
	});

	return {
		dateKey,
		topFiles: [...fileCounts.values()].sort((a, b) => b.count - a.count).slice(0, 10),
		topApps: topEntries(appCounts).map(({ key, count }) => ({ app: key, count })),
		topUrls: [...urlCounts.values()].sort((a, b) => b.count - a.count).slice(0, 6),
		clipboardSnippets: clipboardSnippets.slice(0, 8),
		episodes: episodeRows,
		personHints: [...personHints],
	};
}

function extractProjectFromIntent(intent: string): string | null {
	const m = intent.match(/([\u4e00-\u9fa5A-Za-z0-9]{2,20}(?:\s*iOS|iOS)?)/);
	if (!m) return null;
	const candidate = m[1]?.trim();
	if (!candidate || /^(代回|转写|帮我|整理|发送)/.test(candidate)) return null;
	return candidate;
}

export function heuristicDistill(agg: DayAggregate): DayDigest {
	const highlights: string[] = [];
	if (agg.topApps[0]) highlights.push(`主要在 ${agg.topApps[0].app} 工作`);
	if (agg.topFiles[0]) highlights.push(`频繁编辑 ${agg.topFiles[0].name}`);
	if (agg.episodes.length > 0) highlights.push(`完成 ${agg.episodes.length} 次语音任务`);

	const people: PersonDigest[] = agg.personHints.slice(0, 6).map((name) => {
		const related = agg.episodes.filter((ep) => ep.intent.includes(name) || ep.summary.includes(name));
		const commitment = related.find((ep) => FOLLOW_UP_PATTERN.test(`${ep.intent} ${ep.summary}`))?.intent;
		return {
			key: slugEntityKey(name),
			name,
			commitment: commitment?.slice(0, 80),
			episodeIds: related.map((ep) => ep.id),
		};
	});

	const projectNames = new Set<string>();
	for (const file of agg.topFiles.slice(0, 3)) {
		const dir = file.path.split("/").slice(-2, -1)[0];
		if (dir && dir.length >= 2) projectNames.add(dir);
	}
	for (const ep of agg.episodes) {
		const p = extractProjectFromIntent(ep.intent);
		if (p) projectNames.add(p);
	}

	const projects: ProjectDigest[] = [...projectNames].slice(0, 5).map((name) => {
		const key = slugEntityKey(name);
		const related = agg.episodes.filter((ep) => ep.intent.includes(name));
		const topFile = agg.topFiles.find((f) => f.path.includes(name) || f.name.includes(name));
		return {
			key,
			name,
			status: related[0]?.status,
			nextStep: related.find((ep) => FOLLOW_UP_PATTERN.test(ep.intent))?.intent.slice(0, 80),
			filePaths: topFile ? [shortPath(topFile.path)] : undefined,
			episodeIds: related.map((ep) => ep.id),
		};
	});

	const summary =
		highlights.length > 0
			? `${agg.dateKey}：${highlights.join("；")}。`
			: `${agg.dateKey}：有轨迹记录，但任务与文件活动较少。`;

	return {
		dateKey: agg.dateKey,
		summary,
		highlights,
		people,
		projects,
		selfNote: agg.episodes.length > 0 ? "习惯通过语音快速下达指令" : undefined,
	};
}

function buildDistillPrompt(agg: DayAggregate): string {
	return `你是本地记忆整固助手。根据以下「已聚合」的一天工作摘要，输出 JSON（不要 markdown），提炼人、事、我三类长期记忆。

日期：${agg.dateKey}

常用应用：${agg.topApps.map((a) => `${a.app}×${a.count}`).join("、") || "无"}
频繁文件：${agg.topFiles.map((f) => `${f.name}×${f.count}`).join("、") || "无"}
任务记录：${
		agg.episodes.map((e) => `[${e.status}] ${e.intent}`).join("；") || "无"
	}
人物线索：${agg.personHints.join("、") || "无"}

输出格式：
{
  "summary": "一句话日摘要",
  "highlights": ["要点1","要点2"],
  "people": [{"key":"slug","name":"姓名","role":"","commitment":"","projectKeys":[],"episodeIds":[]}],
  "projects": [{"key":"slug","name":"项目名","status":"","nextStep":"","personKeys":[],"filePaths":[],"episodeIds":[]}],
  "selfNote": "用户表达习惯一句"
}
只输出 JSON。`;
}

function parseDistillJson(text: string, dateKey: string): DayDigest | null {
	const start = text.indexOf("{");
	const end = text.lastIndexOf("}");
	if (start < 0 || end <= start) return null;
	try {
		const raw = JSON.parse(text.slice(start, end + 1)) as Partial<DayDigest>;
		if (!raw.summary || typeof raw.summary !== "string") return null;
		return {
			dateKey,
			summary: raw.summary,
			highlights: Array.isArray(raw.highlights) ? raw.highlights.filter((h): h is string => typeof h === "string") : [],
			people: Array.isArray(raw.people)
				? raw.people
						.filter((p): p is PersonDigest => Boolean(p?.name && p?.key))
						.map((p) => ({
							key: slugEntityKey(String(p.key)),
							name: String(p.name),
							role: p.role ? String(p.role) : undefined,
							commitment: p.commitment ? String(p.commitment) : undefined,
							projectKeys: Array.isArray(p.projectKeys) ? p.projectKeys.map(String) : undefined,
							episodeIds: Array.isArray(p.episodeIds) ? p.episodeIds.map(String) : [],
						}))
				: [],
			projects: Array.isArray(raw.projects)
				? raw.projects
						.filter((p): p is ProjectDigest => Boolean(p?.name && p?.key))
						.map((p) => ({
							key: slugEntityKey(String(p.key)),
							name: String(p.name),
							status: p.status ? String(p.status) : undefined,
							nextStep: p.nextStep ? String(p.nextStep) : undefined,
							personKeys: Array.isArray(p.personKeys) ? p.personKeys.map(String) : undefined,
							filePaths: Array.isArray(p.filePaths) ? p.filePaths.map(String) : undefined,
							episodeIds: Array.isArray(p.episodeIds) ? p.episodeIds.map(String) : [],
						}))
				: [],
			selfNote: raw.selfNote ? String(raw.selfNote) : undefined,
		};
	} catch {
		return null;
	}
}

export async function distillDay(agg: DayAggregate): Promise<DayDigest> {
	if (!hasFastModelApiKey()) return heuristicDistill(agg);
	try {
		const text = await generateFastText(buildDistillPrompt(agg), {
			maxOutputTokens: 768,
			temperature: 0.2,
			feature: "voice_structure",
			operationId: "memory-consolidation",
		});
		const parsed = parseDistillJson(text, agg.dateKey);
		if (parsed) return parsed;
	} catch {
		/* ponytail: LLM 失败走启发式 */
	}
	return heuristicDistill(agg);
}

function parsePersonValue(raw: string): PersonMemoryValue | null {
	try {
		const v = JSON.parse(raw) as PersonMemoryValue;
		return v?.name ? v : null;
	} catch {
		return null;
	}
}

function parseProjectValue(raw: string): ProjectMemoryValue | null {
	try {
		const v = JSON.parse(raw) as ProjectMemoryValue;
		return v?.name ? v : null;
	} catch {
		return null;
	}
}

function mergePerson(existing: PersonMemoryValue | null, incoming: PersonMemoryValue): PersonMemoryValue {
	if (!existing) return incoming;
	return {
		name: incoming.name || existing.name,
		role: incoming.role ?? existing.role,
		commitment: incoming.commitment ?? existing.commitment,
		projectKeys: [...new Set([...(existing.projectKeys ?? []), ...(incoming.projectKeys ?? [])])],
		episodeIds: [...new Set([...(existing.episodeIds ?? []), ...incoming.episodeIds])],
		lastSeenDate: incoming.lastSeenDate,
		history: [...(existing.history ?? []), ...(incoming.history ?? [])].slice(-30),
	};
}

function mergeProject(existing: ProjectMemoryValue | null, incoming: ProjectMemoryValue): ProjectMemoryValue {
	if (!existing) return incoming;
	return {
		name: incoming.name || existing.name,
		status: incoming.status ?? existing.status,
		nextStep: incoming.nextStep ?? existing.nextStep,
		personKeys: [...new Set([...(existing.personKeys ?? []), ...(incoming.personKeys ?? [])])],
		filePaths: [...new Set([...(existing.filePaths ?? []), ...(incoming.filePaths ?? [])])].slice(0, 12),
		episodeIds: [...new Set([...(existing.episodeIds ?? []), ...incoming.episodeIds])],
		lastActiveDate: incoming.lastActiveDate,
		history: [...(existing.history ?? []), ...(incoming.history ?? [])].slice(-30),
	};
}

export function getLastConsolidatedDate(dataDir?: string): string | null {
	const row = listActiveMemories("meta", dataDir).find((m) => m.key === META_LAST_DATE_KEY);
	return row?.value ?? null;
}

export function writeDigest(digest: DayDigest, dataDir?: string): void {
	const dayValue: DayDigestValue = {
		date: digest.dateKey,
		summary: digest.summary,
		highlights: digest.highlights,
		topApps: [],
		episodeCount: digest.people.reduce((n, p) => n + p.episodeIds.length, 0),
	};
	upsertMemory(
		{ type: "digest.day", key: digest.dateKey, value: JSON.stringify(dayValue), confidence: 0.75 },
		dataDir,
	);

	for (const person of digest.people) {
		const existing = listActiveMemories("entity.person", dataDir).find((m) => m.key === person.key);
		const incoming: PersonMemoryValue = {
			name: person.name,
			role: person.role,
			commitment: person.commitment,
			projectKeys: person.projectKeys,
			episodeIds: person.episodeIds,
			lastSeenDate: digest.dateKey,
			history: [{ date: digest.dateKey, note: person.commitment ?? digest.summary.slice(0, 80) }],
		};
		const merged = mergePerson(existing ? parsePersonValue(existing.value) : null, incoming);
		upsertMemory(
			{
				type: "entity.person",
				key: person.key,
				value: JSON.stringify(merged),
				confidence: 0.8,
				source: person.episodeIds[0],
			},
			dataDir,
		);
	}

	for (const project of digest.projects) {
		const existing = listActiveMemories("entity.project", dataDir).find((m) => m.key === project.key);
		const incoming: ProjectMemoryValue = {
			name: project.name,
			status: project.status,
			nextStep: project.nextStep,
			personKeys: project.personKeys,
			filePaths: project.filePaths,
			episodeIds: project.episodeIds,
			lastActiveDate: digest.dateKey,
			history: [{ date: digest.dateKey, note: project.nextStep ?? digest.summary.slice(0, 80) }],
		};
		const merged = mergeProject(existing ? parseProjectValue(existing.value) : null, incoming);
		upsertMemory(
			{
				type: "entity.project",
				key: project.key,
				value: JSON.stringify(merged),
				confidence: 0.8,
				source: project.episodeIds[0],
			},
			dataDir,
		);
	}

	if (digest.selfNote) {
		const prefKey = "profile.consolidatedHabit";
		const existing = listActiveMemories("preference", dataDir).find((m) => m.key === prefKey);
		let habits: string[] = [];
		if (existing) {
			try {
				const parsed = JSON.parse(existing.value);
				habits = Array.isArray(parsed) ? parsed.filter((h): h is string => typeof h === "string") : [];
			} catch {
				habits = [];
			}
		}
		if (!habits.includes(digest.selfNote)) habits.push(digest.selfNote);
		upsertMemory(
			{ type: "preference", key: prefKey, value: JSON.stringify(habits.slice(-8)), confidence: 0.7 },
			dataDir,
		);
	}

	upsertMemory(
		{ type: "meta", key: META_LAST_DATE_KEY, value: digest.dateKey, confidence: 1 },
		dataDir,
	);
}

export function markDayEventsDigested(dateKey: string, dataDir?: string): void {
	const { start, end } = dayBoundsMs(dateKey);
	const conn = getDb(dataDir);
	conn
		.prepare(
			`UPDATE context_events SET retention_tier = 'digested'
			 WHERE timestamp >= ? AND timestamp <= ? AND retention_tier = 'raw'`,
		)
		.run(start, end);
}

export function cleanupRaw(consolidatedDateKeys: string[], dataDir?: string): void {
	for (const dateKey of consolidatedDateKeys) {
		markDayEventsDigested(dateKey, dataDir);
	}

	const conn = getDb(dataDir);
	const cutoff = Date.now() - RAW_RETENTION_DAYS * 86_400_000;
	conn
		.prepare(
			`DELETE FROM context_events
			 WHERE retention_tier = 'raw' AND timestamp < ? AND type != 'clipboard.changed'`,
		)
		.run(cutoff);

	const clipboardRows = conn
		.prepare(
			`SELECT id FROM context_events WHERE type = 'clipboard.changed' ORDER BY timestamp DESC`,
		)
		.all() as Array<{ id: string }>;
	if (clipboardRows.length > CLIPBOARD_KEEP_COUNT) {
		const dropIds = clipboardRows.slice(CLIPBOARD_KEEP_COUNT).map((r) => r.id);
		const placeholders = dropIds.map(() => "?").join(",");
		conn.prepare(`DELETE FROM context_events WHERE id IN (${placeholders})`).run(...dropIds);
	}
}

export function getPendingConsolidationDates(dataDir?: string): string[] {
	const last = getLastConsolidatedDate(dataDir);
	const yesterday = yesterdayDateKey();
	if (!last) return [yesterday];

	const dates: string[] = [];
	let cursor = addDays(last, 1);
	while (cursor <= yesterday && dates.length < MAX_CATCHUP_DAYS) {
		dates.push(cursor);
		cursor = addDays(cursor, 1);
	}
	return dates;
}

export async function runConsolidationForDate(dateKey: string, dataDir?: string): Promise<DayDigest> {
	const { start, end } = dayBoundsMs(dateKey);
	const events = listContextEventsInRange(start, end, dataDir);
	const episodes = listEpisodesInRange(start, end, dataDir);
	const agg = aggregateDay(events, episodes, dateKey);
	const digest = await distillDay(agg);
	writeDigest(digest, dataDir);
	return digest;
}

export async function runPendingConsolidation(dataDir?: string): Promise<string[]> {
	const pending = getPendingConsolidationDates(dataDir);
	if (pending.length === 0) return [];

	const done: string[] = [];
	for (const dateKey of pending) {
		await runConsolidationForDate(dateKey, dataDir);
		done.push(dateKey);
	}
	cleanupRaw(done, dataDir);
	return done;
}

export function listMemoryEntities(dataDir?: string): MemoryEntityRecord[] {
	const people: MemoryEntityRecord[] = [];
	for (const m of listActiveMemories("entity.person", dataDir)) {
		const value = parsePersonValue(m.value);
		if (!value) continue;
		people.push({
			id: m.id,
			type: "entity.person",
			key: m.key,
			value,
			confidence: m.confidence,
			updatedAt: m.updatedAt,
		});
	}

	const projects: MemoryEntityRecord[] = [];
	for (const m of listActiveMemories("entity.project", dataDir)) {
		const value = parseProjectValue(m.value);
		if (!value) continue;
		projects.push({
			id: m.id,
			type: "entity.project",
			key: m.key,
			value,
			confidence: m.confidence,
			updatedAt: m.updatedAt,
		});
	}

	return [...people, ...projects].sort((a, b) => b.updatedAt - a.updatedAt);
}

export interface EntityBriefOptions {
	/** 当前屏幕/情境文本，命中的人/项目名会被优先排到前面 */
	matchText?: string;
	personLimit?: number;
	projectLimit?: number;
}

/** 纯函数核心：按「是否命中当前情境」排序，其次按最近活跃时间；供自检和真实查询共用。 */
export function formatEntityBriefFromRecords(
	records: MemoryEntityRecord[],
	opts: EntityBriefOptions = {},
): string {
	const { matchText, personLimit = 3, projectLimit = 2 } = opts;
	const needle = matchText?.trim();

	function rank<T extends { updatedAt: number; value: { name: string } }>(list: T[]): T[] {
		return [...list].sort((a, b) => {
			const aHit = needle && needle.includes(a.value.name) ? 1 : 0;
			const bHit = needle && needle.includes(b.value.name) ? 1 : 0;
			if (aHit !== bHit) return bHit - aHit;
			return b.updatedAt - a.updatedAt;
		});
	}

	const people = rank(
		records.filter((r): r is MemoryEntityRecord & { type: "entity.person" } => r.type === "entity.person"),
	).slice(0, personLimit);
	const projects = rank(
		records.filter((r): r is MemoryEntityRecord & { type: "entity.project" } => r.type === "entity.project"),
	).slice(0, projectLimit);

	const lines: string[] = [];
	if (people.length) {
		lines.push("长期记忆·相关人物：");
		for (const p of people) {
			const bits = [p.value.role, p.value.commitment].filter(Boolean).join("；");
			lines.push(`  - ${p.value.name}${bits ? `（${bits}）` : ""}`);
		}
	}
	if (projects.length) {
		lines.push("长期记忆·相关项目：");
		for (const proj of projects) {
			const bits = [
				proj.value.status ? `状态：${proj.value.status}` : null,
				proj.value.nextStep ? `下一步：${proj.value.nextStep}` : null,
			]
				.filter(Boolean)
				.join("；");
			lines.push(`  - ${proj.value.name}${bits ? `（${bits}）` : ""}`);
		}
	}
	return lines.join("\n");
}

/** 供预测/代回/Aha/Planner 注入：把日整固沉淀的人/项目记忆拼成简报。 */
export function formatEntityBrief(dataDir?: string, opts: EntityBriefOptions = {}): string {
	return formatEntityBriefFromRecords(listMemoryEntities(dataDir), opts);
}

/** ponytail: 最小自检，tsx packages/memory/src/consolidate-self-check.ts */
export function runConsolidateSelfCheck(): void {
	const events: ContextEventRow[] = [
		{
			id: "e1",
			type: "file.modified",
			source: "finder",
			timestamp: Date.now(),
			data: { filePath: "/Users/me/proj/app.ts", appName: "Cursor" },
		},
		{
			id: "e2",
			type: "app.active",
			source: "system",
			timestamp: Date.now(),
			data: { appName: "Cursor", windowTitle: "知更 iOS" },
		},
	];
	const episodes: Episode[] = [
		{
			id: "ep1",
			timestamp: Date.now(),
			intent: "帮我整理报价发给 Jason",
			goal: "",
			status: "partial",
			summary: "已整理",
			planJson: "{}",
			durationMs: 1000,
		},
	];
	const agg = aggregateDay(events, episodes, "2026-07-14");
	console.assert(agg.topFiles.length === 1, "topFiles");
	console.assert(agg.personHints.includes("Jason"), "personHints");
	const digest = heuristicDistill(agg);
	console.assert(digest.people.some((p) => p.name === "Jason"), "digest people");
	console.assert(slugEntityKey("知更 iOS") === "知更-ios", "slug");

	const records: MemoryEntityRecord[] = [
		{
			id: "m1",
			type: "entity.person",
			key: "jason",
			value: { name: "Jason", role: "FA", episodeIds: [], lastSeenDate: "2026-07-10" },
			confidence: 0.8,
			updatedAt: 1,
		},
		{
			id: "m2",
			type: "entity.person",
			key: "amy",
			value: { name: "Amy", commitment: "周五前发报价", episodeIds: [], lastSeenDate: "2026-07-14" },
			confidence: 0.8,
			updatedAt: 100,
		},
		{
			id: "m3",
			type: "entity.project",
			key: "knowbird-ios",
			value: { name: "知更 iOS", status: "开发中", nextStep: "接入语音", episodeIds: [], lastActiveDate: "2026-07-14" },
			confidence: 0.8,
			updatedAt: 50,
		},
	];
	// 无匹配时按 updatedAt 兜底：Amy(100) 应排在 Jason(1) 前面
	const fallback = formatEntityBriefFromRecords(records, { personLimit: 1 });
	console.assert(fallback.includes("Amy") && !fallback.includes("Jason"), "entity brief fallback order");
	// 命中当前情境文本时应优先排到最前，覆盖 updatedAt 顺序
	const matched = formatEntityBriefFromRecords(records, { matchText: "刚才跟 Jason 聊了报价", personLimit: 1 });
	console.assert(matched.includes("Jason") && !matched.includes("Amy"), "entity brief match priority");
	console.assert(formatEntityBriefFromRecords(records, { projectLimit: 1 }).includes("知更 iOS"), "entity brief project");
}
