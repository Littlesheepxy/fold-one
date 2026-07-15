import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { homedir, hostname } from "node:os";
import { join } from "node:path";
import {
	analyzeFile,
	analyzePaths,
	isLevelDbDir,
	listDirNames,
	probeReadable,
	sanitizeForJson,
} from "./analyze.js";
import type {
	AccessStatus,
	BlockReason,
	HabitDataType,
	InstalledImeInfo,
	InputHabitScanReport,
	InputMethodScanResult,
	MigrationPath,
	PermissionProbe,
	ValueRating,
} from "./types.js";

const HOME = homedir();
const LIB = join(HOME, "Library");

const SEARCH_ROOTS = [
	join(LIB, "Application Support"),
	join(LIB, "Containers"),
	join(LIB, "Group Containers"),
	join(LIB, "Preferences"),
	join(LIB, "Caches"),
	join(LIB, "Input Methods"),
	join(LIB, "Keyboard Layouts"),
	join(LIB, "Dictionaries"),
	join(LIB, "Spelling"),
	"/Library/Input Methods",
].filter((p) => existsSync(p));

const KEYWORDS =
	/sogou|squirrel|rime|baidu|wechat|wetype|wx|doubao|qwen|qianwen|input|ime|dictionary|lexicon|userdict|phrase|frequency|learn|candidate|scim|inputmethod/i;

interface ImeProfile {
	id: string;
	name: string;
	keywords: RegExp;
	seedPaths: string[];
	bundleIds?: string[];
}

const IME_PROFILES: ImeProfile[] = [
	{
		id: "apple",
		name: "Apple 系统输入法",
		keywords: /^(com\.apple\.(TextInput|inputmethod|HIToolbox)|TextInput|HIToolbox|SCIM|DynamicPhrase|emoji_adaptation)/i,
		seedPaths: [
			join(LIB, "Dictionaries"),
			join(LIB, "Spelling"),
			join(LIB, "Preferences/com.apple.HIToolbox.plist"),
			join(LIB, "Preferences/com.apple.TextInput.plist"),
			join(LIB, "Preferences/.GlobalPreferences.plist"),
		],
		bundleIds: ["com.apple.inputmethod.SCIM"],
	},
	{
		id: "sogou",
		name: "搜狗输入法",
		keywords: /sogou|sgim|sogoupy/i,
		seedPaths: [
			join(LIB, "Application Support/Sogou"),
			join(LIB, "Application Support/Sogou/InputMethod/SogouPY.users"),
			join(LIB, "Application Support/com.sogou.inputmethod.sogou"),
			join(LIB, "Preferences/com.sogou.inputmethod.sogou.plist"),
			"/Library/Input Methods/SogouInput.app",
		],
		bundleIds: ["com.sogou.inputmethod.sogou"],
	},
	{
		id: "wetype",
		name: "微信输入法",
		keywords: /wetype|wechat.*input|tencent\.inputmethod/i,
		seedPaths: [
			join(LIB, "Application Support/WeType"),
			join(LIB, "Preferences/com.tencent.inputmethod.wetype.plist"),
		],
		bundleIds: ["com.tencent.inputmethod.wetype"],
	},
	{
		id: "baidu",
		name: "百度输入法",
		keywords: /baidu.*input|baiduim|BaiduIM/i,
		seedPaths: [
			join(LIB, "Application Support/BaiduInput"),
			join(LIB, "Application Support/com.baidu.inputmethod.BaiduIM"),
			"/Library/Input Methods/BaiduIM.app",
		],
		bundleIds: ["com.baidu.inputmethod.BaiduIM"],
	},
	{
		id: "rime",
		name: "Rime / 鼠须管",
		keywords: /^(Rime|Squirrel|org\.rime\.inputmethod)/i,
		seedPaths: [
			join(HOME, "Library/Rime"),
			join(LIB, "Rime"),
			join(LIB, "Application Support/Rime"),
			"/Library/Input Methods/Squirrel.app",
			join(LIB, "Input Methods/Squirrel.app"),
		],
		bundleIds: ["org.rime.inputmethod.Squirrel"],
	},
	{
		id: "doubao",
		name: "豆包输入法",
		keywords: /doubao|bytedance.*input|豆包/i,
		seedPaths: [
			join(LIB, "Application Support/DoubaoInput"),
			join(LIB, "Application Support/com.bytedance.doubao.input"),
		],
	},
	{
		id: "qwen",
		name: "千问输入法",
		keywords: /^(QwenInput|com\.alibaba\.qwen\.input)/i,
		seedPaths: [
			join(LIB, "Application Support/QwenInput"),
			join(LIB, "Application Support/com.alibaba.qwen.input"),
		],
	},
];

const IME_BUNDLE_CANDIDATES: Record<string, string[]> = {
	apple: ["/System/Library/Input Methods/SCIM.app"],
	sogou: ["/Library/Input Methods/SogouInput.app", join(LIB, "Input Methods/SogouInput.app")],
	wetype: [
		"/Library/Input Methods/WeType.app",
		join(LIB, "Input Methods/WeType.app"),
		"/Applications/WeType.app",
	],
	baidu: ["/Library/Input Methods/BaiduIM.app", join(LIB, "Input Methods/BaiduIM.app")],
	rime: ["/Library/Input Methods/Squirrel.app", join(LIB, "Input Methods/Squirrel.app")],
};

const IME_ICON_FALLBACK: Record<string, string | null> = {
	wetype: "微信",
};

function resolveImeBundlePath(profile: ImeProfile): string | null {
	for (const p of IME_BUNDLE_CANDIDATES[profile.id] ?? []) {
		if (existsSync(p)) return p;
	}
	for (const p of profile.seedPaths) {
		if (p.endsWith(".app") && existsSync(p)) return p;
	}
	return null;
}

function isProfileDetected(profile: ImeProfile): boolean {
	const matchedPaths = walkMatchPaths(profile, 40);
	return (
		profile.seedPaths.some((p) => existsSync(p)) ||
		matchedPaths.some((p) => profile.seedPaths.some((s) => p === s || p.startsWith(`${s}/`))) ||
		(profile.bundleIds?.some((bid) => {
			try {
				return (
					execFileSync("defaults", ["read", "com.apple.HIToolbox", "AppleEnabledInputSources"], {
						encoding: "utf8",
						maxBuffer: 256 * 1024,
					}).includes(bid) ||
					execFileSync("defaults", ["read", "com.apple.HIToolbox", "AppleInputSourceHistory"], {
						encoding: "utf8",
						maxBuffer: 256 * 1024,
					}).includes(bid)
				);
			} catch {
				return false;
			}
		}) ??
			false)
	);
}

function importHintFor(id: string): string {
	switch (id) {
		case "sogou":
			return "偏好设置 → 词库 → 导出 .bin →「搜狗备份 → Rime」";
		case "wetype":
			return "设置 → 跨设备 → 个人词库/常用语同步（无本地 .bin）";
		case "apple":
			return "Text Replacement · 一键导入 PoC";
		case "rime":
			return "读取 ~/Library/Rime · 可导出到 zhigeng.user.dict.yaml";
		case "baidu":
			return "设置内导出 txt（待接适配器）";
		default:
			return "待调研官方导出路径";
	}
}

function quickMigrationPath(id: string, detected: boolean): MigrationPath {
	if (!detected) return "NOT_CURRENTLY_FEASIBLE";
	if (id === "apple" || id === "rime") return "AUTO_SCAN";
	if (id === "sogou") return "ASSISTED_IMPORT";
	if (id === "wetype" || id === "baidu") return "MANUAL_IMPORT";
	return "MANUAL_IMPORT";
}

/** ponytail: fast detect — no file content analysis; use before import UI */
export function listInstalledInputMethods(): InstalledImeInfo[] {
	return IME_PROFILES.map((profile) => {
		const detected = isProfileDetected(profile);
		return {
			id: profile.id,
			name: profile.name,
			detected,
			bundlePath: resolveImeBundlePath(profile),
			iconFallbackApp: IME_ICON_FALLBACK[profile.id] ?? null,
			migrationPath: quickMigrationPath(profile.id, detected),
			importHint: importHintFor(profile.id),
		};
	});
}

function walkMatchPaths(profile: ImeProfile, maxPaths = 80): string[] {
	const found = new Set<string>();

	for (const seed of profile.seedPaths) {
		if (existsSync(seed)) found.add(seed);
	}

	for (const root of SEARCH_ROOTS) {
		let names: string[];
		try {
			names = readdirSync(root);
		} catch {
			continue;
		}
		for (const name of names) {
			if (!profile.keywords.test(name)) continue;
			const full = join(root, name);
			found.add(full);
			if (found.size >= maxPaths) break;
		}
		if (found.size >= maxPaths) break;
	}

	// ponytail: one-level file sweep under detected app support dirs
	for (const base of [...found]) {
		if (!existsSync(base) || !statSync(base).isDirectory()) continue;
		try {
			for (const entry of readdirSync(base)) {
				if (!KEYWORDS.test(entry)) continue;
				const full = join(base, entry);
				found.add(full);
				if (statSync(full).isDirectory() && isLevelDbDir(full)) found.add(full);
			}
		} catch {
			/* permission */
		}
	}

	return [...found].sort();
}

function collectNestedHabitFiles(dir: string, files: string[], depth: number) {
	if (depth <= 0) return;
	try {
		for (const name of readdirSync(dir)) {
			const full = join(dir, name);
			let st;
			try {
				st = statSync(full);
			} catch {
				continue;
			}
			if (st.isDirectory()) {
				if (isLevelDbDir(full)) files.push(full);
				else if (/SogouPY\.users|userDict/i.test(dir) || /^\d{6,}$/.test(name)) {
					collectNestedHabitFiles(full, files, depth - 1);
				} else collectNestedHabitFiles(full, files, depth - 1);
			} else if (/sgim_usr|sgim_phrase|\.bin$|\.db$/i.test(name)) {
				files.push(full);
			}
		}
	} catch {
		/* skip */
	}
}

function pickAnalyzeTargets(paths: string[]): string[] {
	const files: string[] = [];
	const exts =
		/\.(db|sqlite|plist|json|yaml|yml|txt|dat|bin|ldb|log|userdict|dict|lexicon)$/i;

	for (const p of paths) {
		if (!existsSync(p)) continue;
		let st;
		try {
			st = statSync(p);
		} catch {
			continue;
		}
		if (st.isDirectory()) {
			if (/SogouPY\.users|userDict/i.test(p)) {
				collectNestedHabitFiles(p, files, 3);
			}
			if (isLevelDbDir(p)) {
				files.push(p);
				continue;
			}
			try {
				for (const name of readdirSync(p)) {
					const full = join(p, name);
					if (/sgim_usr|sgim_phrase|userdict|user_hot_word|common\.db|DynamicPhrase|emoji_adaptation|SogouPY\.users/i.test(name)) {
						files.push(full);
						if (statSync(full).isDirectory()) {
							if (isLevelDbDir(full)) files.push(full);
							else collectNestedHabitFiles(full, files, 2);
						}
					} else if (exts.test(name) && statSync(full).isFile() && statSync(full).size < 50 * 1024 * 1024) {
						files.push(full);
					}
				}
			} catch {
				/* skip */
			}
		} else if (st.isFile() && st.size < 50 * 1024 * 1024) {
			files.push(p);
		}
	}
	return [...new Set(files)].sort((a, b) => scoreHabitPath(b) - scoreHabitPath(a));
}

function scoreHabitPath(p: string): number {
	if (/sgim_usr|sgim_phrase|user_hot_word|DynamicPhraseLexicon|textReplacement/i.test(p)) return 100;
	if (/userDict|SogouPY\.users|\.bin$/i.test(p)) return 80;
	if (/leveldb|\.db$/i.test(p)) return 60;
	if (/Cache\.db|Preferences/i.test(p)) return 10;
	return 20;
}

function inferHabitTypes(files: Awaited<ReturnType<typeof analyzePaths>>): HabitDataType[] {
	const types = new Set<HabitDataType>();
	for (const f of files) {
		if (f.format === "leveldb") types.add("leveldb_store");
		if (/text.replacement|text replacement/i.test(f.notes.join(" "))) types.add("text_replacement");
		if (/DynamicPhrase|phrase/i.test(f.path)) types.add("learning_data");
		if (/userdict|user_hot_word|sgim_usr|sgim_phrase/i.test(f.path)) types.add("user_lexicon");
		if (/frequency|freq/i.test(f.path + f.notes.join(" "))) types.add("frequency_data");
		if (f.tables?.some((t) => t.habitLike)) types.add("user_dictionary");
		if (/emoji_adaptation/i.test(f.path)) types.add("learning_data");
	}
	if (types.size === 0 && files.some((f) => f.readable)) types.add("unknown_personal_data");
	return [...types];
}

function accessFromFiles(files: Awaited<ReturnType<typeof analyzePaths>>): AccessStatus {
	if (files.length === 0) return "unknown";
	const readable = files.filter((f) => f.readable);
	if (readable.length === 0) return "blocked";
	const useful = readable.filter(
		(f) =>
			f.tables?.some((t) => t.habitLike && (t.samples?.length ?? 0) > 0) ||
			f.format === "leveldb" ||
			/sgim_usr|sgim_phrase|user_hot_word/i.test(f.path) ||
			/text.replacement|user.lexicon/i.test(f.notes.join(" ")),
	);
	if (useful.length > 0) return "readable";
	if (readable.length === files.length) return "partial";
	return "partial";
}

function rateValue(types: HabitDataType[], access: AccessStatus): ValueRating {
	if (access === "blocked") return "UNKNOWN";
	if (types.includes("text_replacement") || types.includes("user_lexicon")) return "HIGH";
	if (types.includes("user_dictionary") || types.includes("learning_data")) return "HIGH";
	if (types.includes("leveldb_store")) return "MEDIUM";
	if (types.includes("unknown_personal_data")) return "LOW";
	return "UNKNOWN";
}

function migrationPathFor(
	id: string,
	access: AccessStatus,
	types: HabitDataType[],
	detected: boolean,
): MigrationPath {
	if (!detected) return "NOT_CURRENTLY_FEASIBLE";
	if (id === "rime" && access === "readable") return "AUTO_SCAN";
	if (id === "apple" && types.includes("text_replacement")) return "AUTO_SCAN";
	if (access === "readable" && types.some((t) => t !== "unknown_personal_data")) return "ASSISTED_IMPORT";
	if (access === "partial") return "MANUAL_IMPORT";
	if (detected) return "MANUAL_IMPORT";
	return "NOT_CURRENTLY_FEASIBLE";
}

function personalDataLabel(types: HabitDataType[]): string {
	if (types.length === 0) return "—";
	return types
		.map((t) =>
			t
				.replace(/_/g, " ")
				.replace(/\b\w/g, (c) => c.toUpperCase()),
		)
		.join(", ");
}

async function probeAppleTextReplacement(): Promise<{ paths: string[]; notes: string[]; files: string[] }> {
	const notes: string[] = [];
	const paths: string[] = [];
	const files: string[] = [];

	const prefPaths = [
		join(LIB, "Preferences/com.apple.TextInput.plist"),
		join(LIB, "Preferences/.GlobalPreferences.plist"),
	];
	for (const p of prefPaths) {
		if (existsSync(p)) files.push(p);
	}

	try {
		const out = execFileSync(
			"defaults",
			["read", "com.apple.textInput.keyboardServices", "textReplacement"],
			{ encoding: "utf8", maxBuffer: 512 * 1024, stdio: ["ignore", "pipe", "ignore"] },
		);
		if (out.trim()) {
			notes.push(`textReplacement entries via defaults: ${out.trim().slice(0, 300)}…`);
			paths.push("com.apple.textInput.keyboardServices/textReplacement");
		}
	} catch {
		notes.push("com.apple.textInput.keyboardServices textReplacement not readable via defaults");
	}

	try {
		const gp = execFileSync(
			"plutil",
			["-extract", "NSUserDictionaryReplacementItems", "json", "-o", "-", join(LIB, "Preferences/.GlobalPreferences.plist")],
			{ encoding: "utf8", maxBuffer: 512 * 1024, stdio: ["ignore", "pipe", "ignore"] },
		);
		const items = JSON.parse(gp) as Array<{ replace?: string; with?: string; on?: number }>;
		if (Array.isArray(items) && items.length > 0) {
			const sample = items
				.slice(0, 5)
				.map((i) => `${i.replace ?? "?"} → ${i.with ?? "?"}`)
				.join("; ");
			notes.push(`Text Replacement (${items.length}): ${sample}`);
			paths.push(join(LIB, "Preferences/.GlobalPreferences.plist#NSUserDictionaryReplacementItems"));
		}
	} catch {
		/* no items or unreadable */
	}

	try {
		const hit = execFileSync("defaults", ["read", "com.apple.HIToolbox"], { encoding: "utf8", maxBuffer: 256 * 1024 });
		if (/SCIM|inputmethod/i.test(hit)) {
			notes.push("HIToolbox confirms Apple/SCIM input sources configured");
			paths.push(join(LIB, "Preferences/com.apple.HIToolbox.plist"));
		}
	} catch {
		/* ignore */
	}

	return { paths, notes, files };
}

async function scanProfile(profile: ImeProfile): Promise<InputMethodScanResult> {
	const matchedPaths = walkMatchPaths(profile);
	const detected = isProfileDetected(profile);

	const notes: string[] = [];
	let analyzeTargets = pickAnalyzeTargets(matchedPaths);

	if (profile.id === "apple") {
		const appleExtra = await probeAppleTextReplacement();
		notes.push(...appleExtra.notes);
		matchedPaths.push(...appleExtra.paths.filter((p) => !matchedPaths.includes(p)));
		analyzeTargets = [...new Set([...analyzeTargets, ...appleExtra.files])];
	}

	const readableFiles = await analyzePaths(analyzeTargets, 20);
	const potentialHabitData = inferHabitTypes(readableFiles);
	if (profile.id === "apple" && notes.some((n) => /Text Replacement/i.test(n))) {
		if (!potentialHabitData.includes("text_replacement")) potentialHabitData.push("text_replacement");
	}
	const accessStatus = accessFromFiles(readableFiles);

	if (profile.id === "sogou") {
		const usr = matchedPaths.find((p) => /sgim_usr|SogouPY\.users/i.test(p));
		if (usr) notes.push("Sogou user lexicon binaries (sgim_usr_*.bin) are proprietary — readable bytes, not plain text");
	}
	if (profile.id === "wetype") {
		const ldb = matchedPaths.find((p) => /user_hot_word|userDict/i.test(p));
		if (ldb) notes.push("WeType user_hot_word is LevelDB — personal habit data likely inside, needs LevelDB adapter");
	}
	if (profile.id === "apple") {
		const dyn = readableFiles.find((f) => /DynamicPhraseLexicon/i.test(f.path));
		if (dyn?.tables?.some((t) => t.name === "Words")) {
			notes.push("DynamicPhraseLexicon Words table uses BLOB Surface/Reading — schema visible, text decode needs Apple-specific adapter");
		}
	}

	const blockReasons = new Set<BlockReason>();
	for (const f of readableFiles) for (const r of f.blockReasons) blockReasons.add(r);
	if (accessStatus === "blocked" && detected) {
		if ([...blockReasons].length === 0) notes.push("paths exist but no readable habit files located yet");
	}

	return {
		id: profile.id,
		name: profile.name,
		detected,
		matchedPaths,
		readableFiles,
		potentialHabitData,
		accessStatus,
		notes,
		migrationPath: migrationPathFor(profile.id, accessStatus, potentialHabitData, detected),
		valueRating: rateValue(potentialHabitData, accessStatus),
		personalDataFound: personalDataLabel(potentialHabitData),
	};
}

async function probePermissions(): Promise<PermissionProbe[]> {
	const probes: PermissionProbe[] = [];
	const dictPath = join(LIB, "Dictionaries/DynamicPhraseLexicon_zh_Hans.db");
	const sogouPath = join(LIB, "Application Support/Sogou/InputMethod/SogouPY.users");
	const containerProbe = join(LIB, "Containers");

	const dictRead = await probeReadable(dictPath);
	probes.push({
		label: "Normal App Permission",
		status: dictRead.ok ? "ok" : "blocked",
		detail: dictRead.ok
			? `Can read ${dictPath}`
			: `Cannot read Apple phrase lexicon: ${dictRead.reasons.join(", ")}`,
	});

	const sogouRead = await probeReadable(sogouPath);
	probes.push({
		label: "User Library (IME vendors)",
		status: sogouRead.ok ? "ok" : "partial",
		detail: sogouRead.ok
			? "Application Support IME paths readable without FDA"
			: `Sogou user path blocked: ${sogouRead.reasons.join(", ")}`,
	});

	let containerCount = 0;
	try {
		containerCount = listDirNames(containerProbe, 5000).filter((n) =>
			/sogou|wetype|baidu|inputmethod/i.test(n),
		).length;
	} catch {
		/* */
	}
	probes.push({
		label: "Container isolation",
		status: containerCount > 0 ? "partial" : "unknown",
		detail:
			containerCount > 0
				? `${containerCount} IME-related Containers entries; sandboxed app data may differ from Application Support`
				: "No obvious IME container bundles in ~/Library/Containers",
	});

	probes.push({
		label: "Full Disk Access",
		status: "unknown",
		detail:
			"Not programmatically verified — TCC-protected paths (other users' data, some system DBs) may need FDA in System Settings → Privacy",
	});

	probes.push({
		label: "User-selected Folder Access",
		status: "unknown",
		detail: "Not used in this PoC scan (would apply to manual import picker only)",
	});

	return probes;
}

function macosVersion(): string {
	if (typeof process.getSystemVersion === "function") return process.getSystemVersion();
	try {
		return execFileSync("sw_vers", ["-productVersion"], { encoding: "utf8" }).trim();
	} catch {
		return process.platform;
	}
}

function buildConclusion(results: InputMethodScanResult[]): string {
	const readable = results.filter((r) => r.detected && r.accessStatus === "readable");
	const partial = results.filter((r) => r.detected && r.accessStatus === "partial");
	if (readable.length >= 2 || (readable.length >= 1 && partial.length >= 1)) {
		return "Mac 可作为输入习惯迁移中枢（PoC）：至少一种输入法有个人习惯数据且可读；多数第三方为专有格式，需按输入法做 Adapter，不适合无差别自动全量导入。";
	}
	if (partial.length > 0) {
		return "Mac 可作为迁移「辅助」中枢：能定位多数已安装输入法的个人数据路径，但大量为专有/加密格式，需 Assisted/Manual Import。";
	}
	return "本机 PoC 尚未发现足够可读的个人习惯数据；需安装目标输入法或授予 Full Disk Access 后重扫。";
}

function sanitizeDeep<T>(value: T): T {
	if (typeof value === "string") return sanitizeForJson(value) as T;
	if (Array.isArray(value)) return value.map((v) => sanitizeDeep(v)) as T;
	if (value && typeof value === "object") {
		const out: Record<string, unknown> = {};
		for (const [k, v] of Object.entries(value)) out[k] = sanitizeDeep(v);
		return out as T;
	}
	return value;
}

export async function scanInputHabits(): Promise<InputHabitScanReport> {
	const results: InputMethodScanResult[] = [];
	for (const profile of IME_PROFILES) {
		results.push(await scanProfile(profile));
	}

	const permissionProbes = await probePermissions();
	const summary = results.map((r) => ({
		inputMethod: r.name,
		detected: r.detected,
		personalDataFound: r.personalDataFound,
		readable: r.accessStatus,
		value: r.valueRating,
		migrationPath: r.migrationPath,
	}));

	return sanitizeDeep({
		scannedAt: new Date().toISOString(),
		host: hostname(),
		macosVersion: macosVersion(),
		permissionProbes,
		results,
		summary,
		conclusion: buildConclusion(results),
	});
}
