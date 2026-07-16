import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { access } from "node:fs/promises";
import { constants } from "node:fs";
// @ts-expect-error better-sqlite3 has no bundled types in this repo
import Database from "better-sqlite3";
import type { BlockReason, FileFormat, ScannedFile } from "./types.js";

type SqliteDb = InstanceType<typeof Database>;

function sanitizeForJson(s: string): string {
	return s.replace(/[\x00-\x1f\x7f]/g, " ");
}

export { sanitizeForJson };

const HABIT_COLUMN_RE =
	/word|phrase|text|input|code|frequency|freq|count|weight|candidate|shortcut|surface|reading|pinyin|lexicon|dict/i;

const SQLITE_MAGIC = Buffer.from("SQLite format 3\0");

export async function probeReadable(path: string): Promise<{ ok: boolean; reasons: BlockReason[] }> {
	try {
		await access(path, constants.R_OK);
		return { ok: true, reasons: [] };
	} catch (err) {
		const code = (err as NodeJS.ErrnoException).code;
		if (code === "EACCES" || code === "EPERM") return { ok: false, reasons: ["file_permission"] };
		return { ok: false, reasons: ["not_located"] };
	}
}

function detectFormat(buf: Buffer): FileFormat {
	if (buf.subarray(0, 16).equals(SQLITE_MAGIC)) return "sqlite";
	if (buf[0] === 0x7b || buf[0] === 0x5b) {
		try {
			JSON.parse(buf.toString("utf8").slice(0, 4096));
			return "json";
		} catch {
			/* fall through */
		}
	}
	const head = buf.subarray(0, 8).toString("utf8");
	if (head.startsWith("bplist00")) return "plist";
	if (head.startsWith("<?xml")) return "plist";
	if (/^---\s*\n/.test(buf.subarray(0, 16).toString("utf8"))) return "yaml";
	if (buf.length > 0 && buf.every((b) => b === 0x20 || b === 0x09 || b === 0x0a || (b >= 0x20 && b <= 0x7e))) {
		return "text";
	}
	return "binary";
}

function shannonEntropy(buf: Buffer): number {
	if (buf.length === 0) return 0;
	const freq = new Array<number>(256).fill(0);
	const slice = buf.subarray(0, Math.min(buf.length, 8192));
	for (const b of slice) freq[b]++;
	let entropy = 0;
	for (const f of freq) {
		if (f === 0) continue;
		const p = f / slice.length;
		entropy -= p * Math.log2(p);
	}
	return Math.round(entropy * 100) / 100;
}

function extractStrings(buf: Buffer, limit = 12): string[] {
	const text = buf.toString("utf8", 0, Math.min(buf.length, 65536));
	const matches = text.match(/[\u4e00-\u9fffA-Za-z0-9_@#.\-]{3,40}/g) ?? [];
	const seen = new Set<string>();
	const out: string[] = [];
	for (const m of matches) {
		if (seen.has(m)) continue;
		seen.add(m);
		out.push(m);
		if (out.length >= limit) break;
	}
	return out;
}

function guessBinaryKind(entropy: number, magicHex: string): NonNullable<ScannedFile["binaryInfo"]>["guess"] {
	if (entropy > 7.5) return "encrypted";
	if (magicHex.startsWith("1f8b") || magicHex.startsWith("789c")) return "compressed";
	if (entropy > 6.8) return "protobuf-like";
	if (entropy > 4.5) return "custom_binary";
	return "unknown";
}

function analyzeSqliteWithCli(path: string): ScannedFile["tables"] {
	const tablesRaw = execFileSync("sqlite3", [path, ".tables"], { encoding: "utf8" }).trim();
	const tableNames = tablesRaw.split(/\s+/).filter(Boolean);
	return tableNames.map((name) => {
		const colRaw = execFileSync("sqlite3", [path, `PRAGMA table_info(${quoteIdent(name)});`], {
			encoding: "utf8",
		});
		const columns = colRaw
			.split("\n")
			.map((line) => line.split("|")[1])
			.filter(Boolean) as string[];
		const habitLike = columns.some((c) => HABIT_COLUMN_RE.test(c));
		let rowCount = 0;
		try {
			rowCount = Number(
				execFileSync("sqlite3", [path, `SELECT COUNT(*) FROM ${quoteIdent(name)};`], { encoding: "utf8" }).trim(),
			);
		} catch {
			rowCount = -1;
		}
		let samples: string[] | undefined;
		if (habitLike && rowCount > 0) {
			const pick = columns.filter((c) => HABIT_COLUMN_RE.test(c));
			const cols = pick.length > 0 ? pick : columns.slice(0, 3);
			const raw = execFileSync(
				"sqlite3",
				[path, `SELECT ${cols.map(quoteIdent).join(", ")} FROM ${quoteIdent(name)} LIMIT 50;`],
				{ encoding: "utf8", maxBuffer: 512 * 1024 },
			);
			samples = raw
				.split("\n")
				.filter(Boolean)
				.slice(0, 50)
				.map((line) => sanitizeForJson(line));
		}
		return { name, columns, rowCount, habitLike, samples };
	});
}

function analyzeSqlite(path: string): ScannedFile["tables"] {
	try {
		const db = new Database(path, { readonly: true, fileMustExist: true });
		try {
			const tables = db
				.prepare(
					`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`,
				)
				.all() as Array<{ name: string }>;

			return tables.map(({ name }) => {
				const cols = db.prepare(`PRAGMA table_info(${quoteIdent(name)})`).all() as Array<{ name: string }>;
				const columns = cols.map((c) => c.name);
				const habitLike = columns.some((c) => HABIT_COLUMN_RE.test(c));
				let rowCount = 0;
				try {
					rowCount = (db.prepare(`SELECT COUNT(*) AS c FROM ${quoteIdent(name)}`).get() as { c: number }).c;
				} catch {
					rowCount = -1;
				}
				let samples: string[] | undefined;
				if (habitLike && rowCount > 0) {
					samples = sampleHabitRows(db, name, columns);
				}
				return { name, columns, rowCount, habitLike, samples };
			});
		} finally {
			db.close();
		}
	} catch {
		return analyzeSqliteWithCli(path);
	}
}

function quoteIdent(name: string): string {
	return `"${name.replace(/"/g, '""')}"`;
}

function sampleHabitRows(db: SqliteDb, table: string, columns: string[]): string[] {
	const textCols = columns.filter((c) => HABIT_COLUMN_RE.test(c));
	const pick = textCols.length > 0 ? textCols : columns.slice(0, 3);
	const sql = `SELECT ${pick.map(quoteIdent).join(", ")} FROM ${quoteIdent(table)} LIMIT 50`;
	try {
		const rows = db.prepare(sql).all() as Array<Record<string, unknown>>;
		return rows.slice(0, 50).map((row) =>
			sanitizeForJson(
				pick
					.map((c) => formatCell(row[c]))
					.filter(Boolean)
					.join(" | "),
			),
		);
	} catch {
		return [];
	}
}

function formatCell(v: unknown): string {
	if (v == null) return "";
	if (Buffer.isBuffer(v)) {
		const utf = v.toString("utf8");
		if (/^[\x20-\x7e\u4e00-\u9fff]+$/.test(utf) && utf.length > 0) return utf;
		return `blob(${v.length})`;
	}
	if (typeof v === "object") return JSON.stringify(v).slice(0, 80);
	return String(v).slice(0, 80);
}

function analyzePlist(path: string): string[] {
	try {
		const json = execFileSync("plutil", ["-convert", "json", "-o", "-", path], {
			encoding: "utf8",
			maxBuffer: 2 * 1024 * 1024,
			stdio: ["ignore", "pipe", "ignore"],
		});
		const notes: string[] = [];
		const lower = json.toLowerCase();
		if (/replacement|shortcut|phrase|onphrase|offphrase/.test(lower)) {
			notes.push("plist may contain text replacement / phrase data");
		}
		if (/word|dict|lexicon|frequency/.test(lower)) {
			notes.push("plist may contain dictionary / lexicon keys");
		}
		return notes;
	} catch {
		return ["plist parse failed"];
	}
}

export function isLevelDbDir(path: string): boolean {
	try {
		const names = readdirSync(path);
		return names.includes("CURRENT") && names.some((n) => n.startsWith("MANIFEST"));
	} catch {
		return false;
	}
}

export async function analyzeFile(path: string): Promise<ScannedFile> {
	const probe = await probeReadable(path);
	const stat = statSync(path);
	const notes: string[] = [];
	const file: ScannedFile = {
		path,
		format: "unknown",
		sizeBytes: stat.size,
		readable: probe.ok,
		blockReasons: probe.reasons,
		notes,
	};

	if (!probe.ok) {
		file.notes.push("cannot read file");
		return file;
	}

	if (stat.isDirectory()) {
		if (isLevelDbDir(path)) {
			file.format = "leveldb";
			file.notes.push("LevelDB directory (CURRENT + MANIFEST + .ldb)");
			return file;
		}
		file.format = "unknown";
		file.notes.push("directory (not analyzed as file)");
		return file;
	}

	let buf: Buffer;
	try {
		buf = readFileSync(path);
	} catch {
		file.readable = false;
		file.blockReasons.push("file_permission");
		return file;
	}

	file.format = detectFormat(buf);

	if (file.format === "sqlite") {
		try {
			file.tables = analyzeSqlite(path);
			const habitTables = (file.tables ?? []).filter((t) => t.habitLike);
			if (habitTables.length > 0) {
				file.notes.push(`${habitTables.length} table(s) with habit-like columns`);
			} else {
				file.notes.push("sqlite readable but no obvious habit columns in schema");
			}
		} catch (err) {
			file.readable = false;
			file.blockReasons.push("proprietary_format");
			file.notes.push(`sqlite open failed: ${sanitizeForJson((err as Error).message)}`);
		}
		return file;
	}

	if (file.format === "plist") {
		file.notes.push(...analyzePlist(path));
		return file;
	}

	if (file.format === "json" || file.format === "yaml" || file.format === "text") {
		const sample = buf.toString("utf8").slice(0, 2048);
		if (HABIT_COLUMN_RE.test(sample)) file.notes.push("text contains habit-related keywords");
		return file;
	}

	const magicHex = buf.subarray(0, 4).toString("hex");
	const entropy = shannonEntropy(buf);
	const stringSample = extractStrings(buf);
	file.binaryInfo = {
		magicHex,
		entropy,
		stringSample: stringSample.map(sanitizeForJson),
		guess: guessBinaryKind(entropy, magicHex),
	};
	if (file.binaryInfo.guess === "encrypted") file.blockReasons.push("encrypted");
	else file.blockReasons.push("proprietary_format");
	file.notes.push(`binary ${file.binaryInfo.guess}, entropy=${entropy}`);
	return file;
}

export async function analyzePaths(paths: string[], maxFiles = 24): Promise<ScannedFile[]> {
	const out: ScannedFile[] = [];
	for (const p of paths.slice(0, maxFiles)) {
		out.push(await analyzeFile(p));
	}
	return out;
}

/** ponytail: stream directory names only, cap entries to avoid full-disk walk */
export function listDirNames(dir: string, max = 200): string[] {
	try {
		return readdirSync(dir).slice(0, max);
	} catch {
		return [];
	}
}
