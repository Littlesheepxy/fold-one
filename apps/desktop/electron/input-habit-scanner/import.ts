import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { resolveDataDir } from "../data-dir.js";
import { sanitizeForJson } from "./analyze.js";
import type { InputHabitImportReport, LexiconEntryKind, PersonalLexiconEntry } from "./types.js";

const LIB = join(homedir(), "Library");

function habitStorePath(): string {
	return join(resolveDataDir(), "input-habits.json");
}

function ensureHabitStoreDir(): void {
	const dir = resolveDataDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** ponytail: crude filter; real LevelDB/Sogou parsers come later */
function isLikelyLexiconToken(s: string): boolean {
	if (/[\u4e00-\u9fff]/.test(s)) return s.length >= 2;
	if (/^[A-Z][A-Z0-9]{2,}$/.test(s)) return true;
	if (/^[A-Za-z][A-Za-z0-9_@#.\-]{2,}$/.test(s) && /[aeiouAEIOU]/.test(s)) return true;
	return false;
}

/** ponytail: naive string scan for PoC; replace with official export adapters later */
function stringsFromBinary(path: string, limit = 200, chineseOnly = false): string[] {
	const buf = readFileSync(path);
	const text = buf.toString("utf8", 0, Math.min(buf.length, 2 * 1024 * 1024));
	const han = text.match(/[\u4e00-\u9fff]{2,20}/g) ?? [];
	const latin = chineseOnly ? [] : (text.match(/[A-Za-z][A-Za-z0-9_@#.\-]{2,32}/g) ?? []);
	const seen = new Set<string>();
	const out: string[] = [];
	for (const s of [...han, ...latin]) {
		const t = sanitizeForJson(s.trim());
		if (!isLikelyLexiconToken(t) || seen.has(t)) continue;
		seen.add(t);
		out.push(t);
		if (out.length >= limit) break;
	}
	return out;
}

function addEntries(
	bucket: PersonalLexiconEntry[],
	seen: Set<string>,
	items: Array<{ surface: string; reading?: string; shortcut?: string; source: string; kind: LexiconEntryKind }>,
) {
	for (const item of items) {
		const surface = sanitizeForJson(item.surface.trim());
		if (!surface) continue;
		const key = `${item.source}:${item.kind}:${surface}:${item.shortcut ?? ""}`;
		if (seen.has(key)) continue;
		seen.add(key);
		bucket.push({
			surface,
			reading: item.reading ? sanitizeForJson(item.reading) : undefined,
			shortcut: item.shortcut ? sanitizeForJson(item.shortcut) : undefined,
			source: item.source,
			kind: item.kind,
		});
	}
}

function importAppleTextReplacement(seen: Set<string>, out: PersonalLexiconEntry[]): number {
	const plist = join(LIB, "Preferences/.GlobalPreferences.plist");
	if (!existsSync(plist)) return 0;
	try {
		const raw = execFileSync(
			"plutil",
			["-extract", "NSUserDictionaryReplacementItems", "json", "-o", "-", plist],
			{ encoding: "utf8", maxBuffer: 512 * 1024, stdio: ["ignore", "pipe", "ignore"] },
		);
		const items = JSON.parse(raw) as Array<{ replace?: string; with?: string; on?: number }>;
		if (!Array.isArray(items)) return 0;
		const before = out.length;
		addEntries(
			out,
			seen,
			items
				.filter((i) => i.on !== 0 && i.replace && i.with)
				.map((i) => ({
					surface: i.with!,
					shortcut: i.replace!,
					source: "apple",
					kind: "text_replacement" as const,
				})),
		);
		return out.length - before;
	} catch {
		return 0;
	}
}

function resolveSogouParseScript(): string | null {
	for (const p of [
		join(process.cwd(), "scripts/sogou-usr-v3-parse.py"),
		join(process.cwd(), "apps/desktop/scripts/sogou-usr-v3-parse.py"),
	]) {
		if (existsSync(p)) return p;
	}
	return null;
}

function findSogouUsrV3Bin(): string | null {
	const root = join(LIB, "Application Support/Sogou/InputMethod/SogouPY.users");
	if (!existsSync(root)) return null;
	for (const uid of readdirSync(root)) {
		const dir = join(root, uid);
		if (!statSync(dir).isDirectory()) continue;
		for (const name of ["sgim_usr_v3new.bin", "sgim_usr.bin", "sgim_usr_v2.bin"]) {
			const path = join(dir, name);
			if (existsSync(path)) return path;
		}
	}
	return null;
}

/** ponytail: subprocess to vendored parse.py; upgrade path = official .txt export adapter */
function importSogouUsrV3(seen: Set<string>, out: PersonalLexiconEntry[]): number {
	const binPath = findSogouUsrV3Bin();
	const script = resolveSogouParseScript();
	if (!binPath || !script) return 0;

	const tsvPath = join(tmpdir(), `zhigeng-sogou-${process.pid}.tsv`);
	const before = out.length;
	try {
		execFileSync("python3", [script, binPath, tsvPath], {
			encoding: "utf8",
			maxBuffer: 8 * 1024 * 1024,
			stdio: ["ignore", "pipe", "pipe"],
		});
		const lines = readFileSync(tsvPath, "utf8").split("\n");
		const batch: Array<{ surface: string; reading?: string; source: string; kind: LexiconEntryKind }> = [];
		for (const line of lines) {
			const trimmed = line.trim();
			if (!trimmed) continue;
			const [surface, , reading] = trimmed.split("\t");
			if (!surface || !isLikelyLexiconToken(surface)) continue;
			batch.push({ surface, reading: reading || undefined, source: "sogou", kind: "word" });
		}
		addEntries(out, seen, batch);
	} catch {
		return 0;
	} finally {
		try {
			unlinkSync(tsvPath);
		} catch {
			/* ignore */
		}
	}
	return out.length - before;
}

/** ponytail: SSTable .ldb UTF-8 scan; user_hot_word LevelDB is protobuf — read v5/*.ldb instead */
function importWeTypeUserDict(seen: Set<string>, out: PersonalLexiconEntry[]): number {
	const root = join(LIB, "Application Support/WeType/userDict/v5");
	if (!existsSync(root)) return 0;
	const before = out.length;
	for (const uid of readdirSync(root)) {
		const dir = join(root, uid);
		try {
			if (!statSync(dir).isDirectory()) continue;
		} catch {
			continue;
		}
		for (const name of readdirSync(dir)) {
			if (!/\.ldb$/i.test(name)) continue;
			for (const surface of stringsFromBinary(join(dir, name), 500, true)) {
				addEntries(out, seen, [{ surface, source: "wetype", kind: "word" }]);
			}
		}
	}
	return out.length - before;
}

function importRimeUserDict(seen: Set<string>, out: PersonalLexiconEntry[]): number {
	const rimeDir = join(homedir(), "Library/Rime");
	if (!existsSync(rimeDir)) return 0;
	const before = out.length;
	for (const name of readdirSync(rimeDir)) {
		if (!/\.(yaml|yml|txt)$/i.test(name)) continue;
		if (!/custom|user|dict/i.test(name)) continue;
		const text = readFileSync(join(rimeDir, name), "utf8");
		for (const line of text.split("\n")) {
			const trimmed = line.trim();
			if (!trimmed || trimmed.startsWith("#")) continue;
			const [word, code] = trimmed.split(/\s+/);
			if (!word || word.length < 2) continue;
			addEntries(out, seen, [{ surface: word, reading: code, source: "rime", kind: "word" }]);
		}
	}
	return out.length - before;
}

export function loadImportedInputHabits(): InputHabitImportReport | null {
	const path = habitStorePath();
	if (!existsSync(path)) return null;
	try {
		return JSON.parse(readFileSync(path, "utf8")) as InputHabitImportReport;
	} catch {
		return null;
	}
}

/** ponytail: PoC one-click import — auto-read local IME data; switch to official-export adapters later */
export function importInputHabitsOneClick(): InputHabitImportReport {
	const entries: PersonalLexiconEntry[] = [];
	const seen = new Set<string>();
	const notes: string[] = [];
	const warnings: string[] = [
		"PoC 一键导入：当前为自动读取本地文件，后续将切换为官方导出/用户选择文件方式。",
	];

	const appleN = importAppleTextReplacement(seen, entries);
	if (appleN > 0) notes.push(`Apple Text Replacement: ${appleN} 条`);
	else notes.push("Apple Text Replacement: 未读到条目");

	const sogouN = importSogouUsrV3(seen, entries);
	if (sogouN > 0) notes.push(`搜狗用户词库 usrDictV3（parse.py）: ${sogouN} 条`);
	else if (existsSync(join(LIB, "Application Support/Sogou"))) {
		const reason = !findSogouUsrV3Bin()
			? "未找到 sgim_usr_v3new.bin"
			: !resolveSogouParseScript()
				? "未找到 sogou-usr-v3-parse.py"
				: "python3 解析失败";
		notes.push(`搜狗: ${reason}`);
	}

	const wetypeN = importWeTypeUserDict(seen, entries);
	if (wetypeN > 0) notes.push(`微信输入法用户词库 v5/*.ldb: ${wetypeN} 条`);
	else if (existsSync(join(LIB, "Application Support/WeType"))) {
		notes.push("微信输入法: 已安装但未从 v5/*.ldb 提取到词条");
	}

	const rimeN = importRimeUserDict(seen, entries);
	if (rimeN > 0) notes.push(`Rime 用户词典: ${rimeN} 条`);

	const bySource: Record<string, number> = {};
	for (const e of entries) {
		bySource[e.source] = (bySource[e.source] ?? 0) + 1;
	}

	const report: InputHabitImportReport = {
		importedAt: new Date().toISOString(),
		mode: "one_click_poc",
		entryCount: entries.length,
		bySource,
		entries,
		sample: entries.slice(0, 50),
		notes,
		warnings,
	};

	ensureHabitStoreDir();
	writeFileSync(habitStorePath(), JSON.stringify(report, null, 2), "utf8");
	return report;
}
