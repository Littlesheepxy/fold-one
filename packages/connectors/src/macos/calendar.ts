import { constants, existsSync, mkdirSync, statSync } from "node:fs";
import { access } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { runShell, runShellDetailed } from "../shell.js";

export interface CalendarEventBrief {
	title: string;
	startAt: number;
	endAt: number;
	calendar?: string;
}

export interface CalendarAccessProbe {
	available: boolean;
	error?: string;
}

const HERE = dirname(fileURLToPath(import.meta.url));
const NATIVE_DIR = join(HERE, "../../native/fold-calendar");
const SOURCE = join(NATIVE_DIR, "main.swift");
const BINARY = join(NATIVE_DIR, "fold-calendar");

type ElectronProcess = NodeJS.Process & { resourcesPath?: string };

function asarUnpackedPath(path: string): string | null {
	if (!path.includes(".asar/")) return null;
	return path.replace(".asar/", ".asar.unpacked/");
}

/**
 * Electron 打包后 helper 必须在 asar 外执行。查找顺序：显式覆盖 →
 * Contents/Resources extraResources → asarUnpack → Vite 主进程产物旁 → 开发源码。
 */
export function calendarBinaryCandidates(input?: {
	explicitPath?: string | null;
	resourcesPath?: string | null;
	moduleDir?: string;
	cwd?: string;
}): string[] {
	const moduleDir = input?.moduleDir ?? HERE;
	const cwd = input?.cwd ?? process.cwd();
	const resourcesPath =
		input?.resourcesPath ?? (process as ElectronProcess).resourcesPath ?? null;
	const explicitPath = input?.explicitPath ?? process.env.FOLD_CALENDAR_BINARY ?? null;
	const candidates = [
		explicitPath,
		resourcesPath ? join(resourcesPath, "fold-calendar", "fold-calendar") : null,
		resourcesPath
			? join(
					resourcesPath,
					"app.asar.unpacked",
					"dist-electron",
					"fold-calendar",
					"fold-calendar",
				)
			: null,
		join(moduleDir, "fold-calendar", "fold-calendar"),
		join(moduleDir, "../resources/fold-calendar/fold-calendar"),
		join(cwd, "resources/fold-calendar/fold-calendar"),
		join(cwd, "apps/desktop/resources/fold-calendar/fold-calendar"),
		BINARY,
	];
	for (const path of [...candidates]) {
		if (!path) continue;
		const unpacked = asarUnpackedPath(path);
		if (unpacked) candidates.push(unpacked);
	}
	return [...new Set(candidates.filter((path): path is string => Boolean(path)))];
}

async function firstExecutable(paths: string[]): Promise<string | null> {
	for (const path of paths) {
		try {
			await access(path, constants.X_OK);
			return path;
		} catch {
			/* try next packaged/dev location */
		}
	}
	return null;
}

async function ensureCalendarBinary(): Promise<string> {
	// 源码 helper 仍需走下面的 mtime 检查；这里只有预编译/打包位置可直接返回。
	const packaged = await firstExecutable(
		calendarBinaryCandidates().filter((path) => path !== BINARY),
	);
	if (packaged) return packaged;

	const infoPlist = join(NATIVE_DIR, "Info.plist");
	const needsBuild =
		!existsSync(BINARY) ||
		(existsSync(SOURCE) && statSync(SOURCE).mtimeMs > statSync(BINARY).mtimeMs);

	if (needsBuild) {
		if (!existsSync(SOURCE)) {
			throw new Error(`fold-calendar source missing: ${SOURCE}`);
		}
		mkdirSync(NATIVE_DIR, { recursive: true });
		const args = ["-O", "-o", BINARY, SOURCE];
		if (existsSync(infoPlist)) {
			args.push(
				"-Xlinker",
				"-sectcreate",
				"-Xlinker",
				"__TEXT",
				"-Xlinker",
				"__info_plist",
				"-Xlinker",
				infoPlist,
			);
		}
		await runShell("swiftc", args, 120_000);
		// ad-hoc 签名，便于 TCC 识别 bundle id
		await runShell("codesign", ["--force", "-s", "-", "--identifier", "com.fold.calendar-cli", BINARY], 15_000).catch(
			() => undefined,
		);
	}
	const compiled = await firstExecutable([BINARY]);
	if (!compiled) {
		throw new Error(
			`fold-calendar helper missing or not executable; searched: ${calendarBinaryCandidates().join(", ")}`,
		);
	}
	return compiled;
}

/**
 * 列出未来若干小时内的日程（EventKit CLI）。
 * 需显式开启：FOLD_CALENDAR_ENABLED=1（默认关闭，避免未授权时静默空结果假装有日历上下文）。
 * 首次会弹系统日历授权；拒绝或失败时返回空数组。
 */
export function isCalendarFeatureEnabled(): boolean {
	return process.env.FOLD_CALENDAR_ENABLED === "1";
}

export async function listUpcomingCalendarEvents(opts?: {
	withinHours?: number;
	limit?: number;
}): Promise<CalendarEventBrief[]> {
	if (!isCalendarFeatureEnabled()) return [];

	const withinHours = Math.max(1, Math.min(opts?.withinHours ?? 12, 48));
	const limit = Math.max(1, Math.min(opts?.limit ?? 5, 10));

	try {
		const bin = await ensureCalendarBinary();
		const result = await runShellDetailed(
			bin,
			[String(withinHours), String(limit)],
			15_000,
		);
		if (result.exitCode === 2) return []; // DENIED
		if (result.exitCode !== 0) return [];

		const events: CalendarEventBrief[] = [];
		for (const line of result.stdout.split("\n")) {
			if (!line.trim()) continue;
			const [title, startStr, endStr, calendar] = line.split("\t");
			const startAt = Number(startStr);
			const endAt = Number(endStr);
			if (!title?.trim() || !Number.isFinite(startAt)) continue;
			events.push({
				title: title.trim(),
				startAt,
				endAt: Number.isFinite(endAt) ? endAt : startAt,
				calendar: calendar?.trim() || undefined,
			});
		}
		return events.sort((a, b) => a.startAt - b.startAt).slice(0, limit);
	} catch {
		return [];
	}
}

export async function probeCalendarAccess(): Promise<CalendarAccessProbe> {
	try {
		const bin = await ensureCalendarBinary();
		const result = await runShellDetailed(bin, ["1", "1"], 20_000);
		if (result.exitCode === 2) {
			return { available: false, error: result.stderr.trim() || "calendar access denied" };
		}
		if (result.exitCode !== 0) {
			return { available: false, error: result.stderr.trim() || `exit ${result.exitCode}` };
		}
		return { available: true };
	} catch (err) {
		return {
			available: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export function formatCalendarBrief(events: CalendarEventBrief[], now = Date.now()): string {
	if (!events.length) return "";
	const lines = ["接下来日程："];
	for (const ev of events.slice(0, 5)) {
		lines.push(`  - ${formatWhen(ev.startAt, now)} ${ev.title}`);
	}
	return lines.join("\n");
}

function formatWhen(startAt: number, now: number): string {
	const deltaMin = Math.round((startAt - now) / 60_000);
	const d = new Date(startAt);
	const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
	const startDay = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
	const today = new Date(now);
	const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
	const dayDiff = Math.round((startDay - todayStart) / 86_400_000);

	if (deltaMin <= 0) return `进行中 · ${hm}`;
	if (deltaMin < 60) return `${deltaMin}分钟后 · ${hm}`;
	if (dayDiff === 0) return `今天 ${hm}`;
	if (dayDiff === 1) return `明天 ${hm}`;
	return `${d.getMonth() + 1}/${d.getDate()} ${hm}`;
}

/** ponytail: 最小自检，不依赖系统日历授权 */
export function runCalendarBriefSelfCheck(): void {
	console.assert(typeof isCalendarFeatureEnabled() === "boolean", "calendar flag");
	const packaged = calendarBinaryCandidates({
		explicitPath: "/tmp/custom-calendar",
		resourcesPath: "/Applications/Fold.app/Contents/Resources",
		moduleDir: "/Applications/Fold.app/Contents/Resources/app.asar/dist-electron",
		cwd: "/tmp/fold",
	});
	console.assert(packaged[0] === "/tmp/custom-calendar", "calendar explicit path first");
	console.assert(
		packaged.includes("/Applications/Fold.app/Contents/Resources/fold-calendar/fold-calendar"),
		"calendar extraResources path",
	);
	console.assert(
		packaged.some((path) => path.includes("app.asar.unpacked")),
		"calendar asar unpack path",
	);
	const now = Date.parse("2026-07-15T10:00:00");
	const brief = formatCalendarBrief(
		[
			{ title: "投资例会", startAt: now + 40 * 60_000, endAt: now + 100 * 60_000 },
			{ title: "尽调访谈", startAt: now + 26 * 3600_000, endAt: now + 27 * 3600_000 },
		],
		now,
	);
	console.assert(brief.includes("接下来日程"), "calendar brief header");
	console.assert(brief.includes("40分钟后"), "calendar soon label");
	console.assert(brief.includes("明天"), "calendar tomorrow label");
}
