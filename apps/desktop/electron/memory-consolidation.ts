import { powerMonitor } from "electron";
import {
	getLastConsolidatedDate,
	runPendingConsolidation,
	yesterdayDateKey,
} from "@fold/memory";

const IDLE_THRESHOLD_SEC = 300;
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
let consolidationRunning = false;
let checkTimer: ReturnType<typeof setInterval> | null = null;

function startOfTodayMs(): number {
	const d = new Date();
	d.setHours(0, 0, 0, 0);
	return d.getTime();
}

function shouldRunConsolidation(forceOnStartup: boolean): boolean {
	const last = getLastConsolidatedDate();
	const yesterday = yesterdayDateKey();
	if (!last) return true;
	if (last >= yesterday) return false;
	if (forceOnStartup) return true;
	try {
		return powerMonitor.getSystemIdleTime() >= IDLE_THRESHOLD_SEC;
	} catch {
		return true;
	}
}

async function tryConsolidate(forceOnStartup = false): Promise<void> {
	if (consolidationRunning) return;
	if (!shouldRunConsolidation(forceOnStartup)) return;

	consolidationRunning = true;
	try {
		const done = await runPendingConsolidation();
		if (done.length > 0) {
			console.log(`[fold:memory] consolidated ${done.join(", ")}`);
		}
	} catch (err) {
		console.warn("[fold:memory] consolidation failed:", err instanceof Error ? err.message : err);
	} finally {
		consolidationRunning = false;
	}
}

/** 启动时与每小时检查：昨日及漏掉的日期（最多 7 天）在空闲时整固。 */
export function startMemoryConsolidationLoop(): void {
	void tryConsolidate(true);

	if (checkTimer) clearInterval(checkTimer);
	checkTimer = setInterval(() => {
		void tryConsolidate(false);
	}, CHECK_INTERVAL_MS);
}

export function stopMemoryConsolidationLoop(): void {
	if (checkTimer) {
		clearInterval(checkTimer);
		checkTimer = null;
	}
}

/** dev / IPC 手动触发 */
export async function triggerMemoryConsolidationNow(): Promise<{ ok: boolean; dates: string[] }> {
	try {
		const dates = await runPendingConsolidation();
		return { ok: true, dates };
	} catch (err) {
		console.warn("[fold:memory] manual consolidation failed:", err);
		return { ok: false, dates: [] };
	}
}

/** 供测试：今天是否还有待整固日期 */
export function hasPendingConsolidationWork(): boolean {
	const last = getLastConsolidatedDate();
	return !last || last < yesterdayDateKey();
}

// ponytail: startOfTodayMs 预留日后「仅白天跑」开关，v1 未用
void startOfTodayMs;
