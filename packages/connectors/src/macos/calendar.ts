import { existsSync, mkdirSync, statSync } from "node:fs";
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

async function ensureCalendarBinary(): Promise<string> {
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
	return BINARY;
}

/**
 * 列出未来若干小时内的日程（EventKit CLI）。
 * 需显式开启：FOLD_CALENDAR_ENABLED=1（打包路径未稳前默认关闭，避免静默空结果假装有日历上下文）。
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
