/**
 * 真实用户旅程（journey）：同一 dataDir 连续多轮，真 planner + 真 skills。
 *
 * - journey-quote: 初次使用（冷启动）→ 后续「上次那个…」续接，验证 episode 召回
 * - journey-feishu: 飞书自聊 + 追发 + 多维表格（真发消息，默认 SKIP，FOLD_STRESS_REAL=1 开启）
 * - journey-workbuddy: 难任务分流路由骨架；live 需网关 + FOLD_STRESS_WORKBUDDY=1
 * - journey-fastpath: compiled 自聊延迟 + recipe 二次日历命中
 * - journey-local-agent: 难意图经 runTask 分流到本地 Agent 并回传（FOLD_STRESS_LIVE_AGENT=1）
 *
 * 邮件固定走 FOLD_MAIL_PROVIDER=file，不打开 Mail.app。
 */
import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { ContextStore, createEmptyContext } from "@fold/context";
import {
	probeAllAgents,
	probeOfficeChannels,
	probeWorkBuddyGateway,
	workbuddyToolsFitIntent,
} from "@fold/connectors";
import { hasPlannerApiKey } from "@fold/ai";
import { listRecentEpisodes } from "@fold/memory";
import {
	formatRelevantEpisodes,
	resolveTier,
	runTask,
	selectRepairBackend,
	tryCompiledPlan,
	type StateEmitter,
} from "@fold/runtime";
import { check, type Check, type Scenario, type ScenarioCtx, type TurnResult } from "./types.ts";

/** 难任务：命中 workflow，但若 MCP 无对应工具则不应硬塞。 */
const WORKBUDDY_HARD_INTENT =
	"把这篇会议纪要同步进我的 Obsidian vault，并按项目名归档";

/** 与当前常见 WorkBuddy（Ardot）工具集匹配的 live 意图（不点名 WorkBuddy，测工具匹配）。 */
const WORKBUDDY_FIT_INTENT = "帮我在 Ardot 里新建一个空白设计稿";

interface TurnRun {
	status: string;
	skills: string[];
	stepStatuses: string[];
	elapsedMs: number;
	asks: string[];
	error?: string;
	resultText?: string;
}

async function playTurn(opts: {
	intent: string;
	dataDir: string;
	store: ContextStore;
	timeoutMs?: number;
	envPatches?: Record<string, string>;
	agentCwd?: string;
	log?: (line: string) => void;
}): Promise<TurnRun> {
	const prevEnv: Record<string, string | undefined> = {};
	const patches: Record<string, string> = {
		FOLD_MAIL_PROVIDER: "file",
		// 旅程测 Fold 自己执行路径
		FOLD_EXECUTION_MODE: "fold_only",
		...opts.envPatches,
	};
	// 故意不改 HOME：假 HOME 会让 CLI 探活弹「找不到钥匙串 / dek」
	for (const [k, v] of Object.entries(patches)) {
		prevEnv[k] = process.env[k];
		process.env[k] = v;
	}

	const asks: string[] = [];
	let resultText: string | undefined;
	const log = opts.log ?? (() => undefined);
	const emit: StateEmitter = (e) => {
		if (e.result) resultText = e.result;
		const bits = [
			e.status,
			e.progressMessage,
			e.thinkingText?.slice(0, 80),
			e.result?.slice(0, 80),
			e.error,
		].filter(Boolean);
		log(`  … ${bits.join(" | ") || e.status}`);
	};
	const started = Date.now();
	const timeoutMs = opts.timeoutMs ?? 90_000;
	const ac = new AbortController();
	const hardTimer = setTimeout(() => ac.abort(), timeoutMs);
	try {
		// AbortSignal alone 杀不死不检查 signal 的 CLI probe；再加一层 Promise.race 硬截断
		const result = await Promise.race([
			runTask(opts.intent, emit, {
				getLiveContext: () => opts.store.get(),
				dataDir: opts.dataDir,
				signal: ac.signal,
				agentCwd: opts.agentCwd,
				requestUserAction: async (req) => {
					asks.push(req.title);
					log(`  … HITL: ${req.title}`);
					// 旅程走 fold_only / CLI；Chrome 连接卡死应立刻取消，别选「改用浏览器」死循环
					if (/Chrome|浏览器连接|仍在等待/.test(req.title)) {
						return "cancel";
					}
					// 授权轮询：自动点「已完成」会死循环
					if (/授权|登录|等待/.test(req.title)) {
						return "cancel";
					}
					const pick = req.options.find((o) => o.id !== "cancel");
					return pick?.id ?? "cancel";
				},
			}),
			new Promise<never>((_, reject) => {
				ac.signal.addEventListener("abort", () => {
					reject(new Error(`journey turn hard-timeout after ${timeoutMs}ms`));
				});
			}),
		]);
		return {
			status: result.status,
			skills: result.steps.map((s) => s.skill),
			stepStatuses: result.steps.map((s) => `${s.skill}:${s.status}`),
			elapsedMs: Date.now() - started,
			asks,
			error: result.error,
			resultText,
		};
	} catch (e) {
		return {
			status: "canceled",
			skills: [],
			stepStatuses: [],
			elapsedMs: Date.now() - started,
			asks,
			error: (e as Error).message,
		};
	} finally {
		clearTimeout(hardTimer);
		for (const [k, v] of Object.entries(prevEnv)) {
			if (v === undefined) delete process.env[k];
			else process.env[k] = v;
		}
	}
}

/**
 * 种子 PDF 放真实 ~/Desktop，并靠 ContextStore.file.created 注入 recentFiles。
 * 不可改 HOME——假 HOME 会触发 macOS「找不到钥匙串 / dek」。
 */
function seedRealPdf(): string {
	const desktop = join(homedir(), "Desktop");
	mkdirSync(desktop, { recursive: true });
	const path = join(desktop, `fold-journey-quote-${Date.now()}.pdf`);
	const py = spawnSync(
		"python3",
		[
			"-c",
			`
import sys
try:
    import fitz
    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Vendor: Acme Corp\\nAmount: $12,000\\nDate: 2026-07-17")
    doc.save(sys.argv[1])
except ImportError:
    open(sys.argv[1], "wb").write(b"%PDF-1.4 placeholder")
`,
			path,
		],
		{ encoding: "utf8", timeout: 15_000 },
	);
	if (py.status !== 0) writeFileSync(path, "%PDF-1.4 placeholder");
	return path;
}

function cleanupSeed(path: string): void {
	try {
		unlinkSync(path);
	} catch {
		/* ignore */
	}
}

function turnChecks(label: string, run: TurnRun, extra: Check[] = [], maxMs = 120_000): TurnResult {
	return {
		label,
		status: run.status,
		checks: [
			check(
				`${label}.finished`,
				["success", "partial", "failed"].includes(run.status),
				`${run.status} ${run.error ?? ""} steps=${run.stepStatuses.join(",")}`,
			),
			check(`${label}.bounded`, run.elapsedMs < maxMs, `${run.elapsedMs}ms`),
			...extra,
		],
	};
}

/** 旅程 1+2：初次使用 → 续接上次任务 */
async function runJourneyQuote(ctx: ScenarioCtx): Promise<TurnResult[]> {
	if (!hasPlannerApiKey()) {
		return [
			{
				label: "journey-quote",
				skipped: "no planner API key — 真实旅程需要真 planner",
				checks: [check("journey.skipped", true, "SKIP")],
			},
		];
	}

	const turns: TurnResult[] = [];
	const store = new ContextStore();
	const pdfPath = seedRealPdf();
	try {
		store.push({
			type: "file.created",
			source: "finder",
			timestamp: Date.now(),
			data: { filePath: pdfPath, appName: "Finder" },
		});

		// ── Turn 1: 桌面 PDF 上下文 + 飞书发给我自己（真发，可在飞书自聊核对）
		const stamp = `Fold压测${Date.now()}`;
		ctx.log(`turn1 starting (seed=${pdfPath}) self-msg stamp=${stamp}`);
		const recentBefore = store.get().recentFiles.some((f) => f.path === pdfPath);
		const t1 = await playTurn({
			intent: `在飞书给我自己发一条消息：${stamp} 桌面报价已整理 Vendor:Acme Amount:$12,000`,
			dataDir: ctx.dataDir,
			store,
			log: ctx.log,
		});
		ctx.log(`turn1: ${t1.status} ${t1.elapsedMs}ms skills=${t1.skills.join(",")} result=${t1.resultText}`);
		turns.push(
			turnChecks("turn1.selfMsg", t1, [
				check("turn1.contextHadFile", recentBefore, pdfPath),
				check(
					"turn1.usedOfficeCli",
					t1.skills.includes("office.cli"),
					t1.skills.join(","),
				),
				check("turn1.success", t1.status === "success", `${t1.status} ${t1.error ?? ""}`),
				check(
					"turn1.reallySent",
					/消息已发送/.test(t1.resultText ?? "") && !/跳过|未确认/.test(t1.resultText ?? ""),
					t1.resultText,
				),
				check(
					"turn1.noGmailHitl",
					!t1.asks.some((a) => /Gmail/i.test(a)),
					t1.asks.join(";"),
				),
			]),
		);

		// ── Turn 1b: 显式邮件词才允许 mail.draft
		ctx.log("turn1b starting: 整理成邮件草稿发给 Jason");
		const t1b = await playTurn({
			intent: "把刚下载的报价整理成邮件草稿发给 Jason",
			dataDir: ctx.dataDir,
			store,
			log: ctx.log,
		});
		ctx.log(`turn1b: ${t1b.status} ${t1b.elapsedMs}ms skills=${t1b.skills.join(",")}`);
		turns.push(
			turnChecks("turn1b.explicitMail", t1b, [
				check(
					"turn1b.attemptedMail",
					t1b.skills.some((s) => s.startsWith("mail.")),
					t1b.skills.join(","),
				),
				check(
					"turn1b.noGmailHitl",
					!t1b.asks.some((a) => /Gmail/i.test(a)),
					t1b.asks.join(";"),
				),
			]),
		);

		// ── Turn 2 前置：episode 落库 + 召回可见（续接的记忆基础）
		const episodes = listRecentEpisodes(10, ctx.dataDir);
		const recall = formatRelevantEpisodes("上次那个报价再发一份给 Jason", ctx.dataDir);
		turns.push({
			label: "memory.afterTurn1",
			checks: [
				check("episode.persisted", episodes.length >= 1, `count=${episodes.length}`),
				check("recall.nonEmpty", recall.trim().length > 0, recall || "(empty)"),
			],
		});

		// ── Turn 2: 续接（仍不强制 mail）
		ctx.log("turn2 starting: 上次那个报价再看看金额");
		const t2 = await playTurn({
			intent: "上次那个报价再看看金额是多少",
			dataDir: ctx.dataDir,
			store,
			log: ctx.log,
		});
		ctx.log(`turn2: ${t2.status} ${t2.elapsedMs}ms skills=${t2.skills.join(",")}`);
		const after = listRecentEpisodes(10, ctx.dataDir);
		turns.push(
			turnChecks("turn2.continuation", t2, [
				check(
					"turn2.usedPdf",
					t2.skills.some((s) => /finder|pdf/.test(s)),
					t2.skills.join(","),
				),
				check(
					"turn2.episodeGrew",
					after.length > episodes.length,
					`before=${episodes.length} after=${after.length}`,
				),
			]),
		);

		// ── Turn 3: 再读桌面 PDF（措辞贴近 turn2，避免「确认还在」触发 os.shell ls）
		ctx.log("turn3 starting: 读桌面报价 PDF 金额");
		const t3 = await playTurn({
			intent: "读一下桌面上刚放的那个报价 PDF，金额是多少",
			dataDir: ctx.dataDir,
			store,
			log: ctx.log,
			timeoutMs: 90_000,
		});
		ctx.log(`turn3: ${t3.status} ${t3.elapsedMs}ms skills=${t3.skills.join(",")}`);
		turns.push(
			turnChecks("turn3.reflect", t3, [
				check(
					"turn3.usedPdf",
					t3.skills.some((s) => /finder|pdf/.test(s)),
					t3.skills.join(","),
				),
				check(
					"turn3.success",
					t3.status === "success" || t3.status === "partial",
					`${t3.status} ${t3.error ?? ""}`,
				),
			]),
		);

		return turns;
	} finally {
		cleanupSeed(pdfPath);
	}
}

/** 旅程 3：飞书自聊 → 追发 → 多维表格（真实写入，仅自聊/一次性表格） */
async function runJourneyFeishu(ctx: ScenarioCtx): Promise<TurnResult[]> {
	if (process.env.FOLD_STRESS_REAL !== "1") {
		return [
			{
				label: "journey-feishu",
				skipped: "set FOLD_STRESS_REAL=1 to run (真发飞书自聊消息 + 建多维表格)",
				checks: [check("journey.skipped", true, "SKIP")],
			},
		];
	}
	const channels = await probeOfficeChannels();
	const feishu = channels.find((c) => c.id === "feishu");
	if (!feishu?.installed || !feishu.authed) {
		return [
			{
				label: "journey-feishu",
				skipped: `lark-cli 未就绪: installed=${feishu?.installed} authed=${feishu?.authed}`,
				checks: [check("journey.skipped", true, "SKIP")],
			},
		];
	}

	const turns: TurnResult[] = [];
	const store = new ContextStore();
	const stamp = `Fold压测${Date.now()}`;

	// Turn 1: 自聊发消息 — 走 compiled tier，不耗 LLM
	const t1 = await playTurn({
		intent: `在飞书给我自己发一条消息：${stamp} 第一条`,
		dataDir: ctx.dataDir,
		store,
		log: ctx.log,
	});
	ctx.log(`feishu turn1: ${t1.status} ${t1.stepStatuses.join(",")}`);
	turns.push(
		turnChecks("feishu.turn1.selfMsg", t1, [
			check("feishu.turn1.usedCli", t1.skills.includes("office.cli"), t1.skills.join(",")),
			check("feishu.turn1.success", t1.status === "success", `${t1.status} ${t1.error ?? ""}`),
		]),
	);

	// Turn 2: 续接追发（用户习惯说「再发一条」）
	const t2 = await playTurn({
		intent: `在飞书给我自己发一条消息：${stamp} 第二条`,
		dataDir: ctx.dataDir,
		store,
		log: ctx.log,
	});
	ctx.log(`feishu turn2: ${t2.status} ${t2.stepStatuses.join(",")}`);
	turns.push(
		turnChecks("feishu.turn2.again", t2, [
			check("feishu.turn2.success", t2.status === "success", `${t2.status} ${t2.error ?? ""}`),
		]),
	);

	// Turn 3: 多维表格（走真 planner）
	if (!hasPlannerApiKey()) {
		turns.push({
			label: "feishu.turn3.bitable",
			skipped: "no planner API key",
			checks: [check("journey.skipped", true, "SKIP")],
		});
		return turns;
	}
	const t3 = await playTurn({
		intent: `用飞书 CLI（lark-cli / office.cli）新建一个多维表格，名字叫「${stamp}」：先 api POST /open-apis/bitable/v1/apps 创建，再往 default_table 批量插入一行，字段「项目」填「压测」。不要开浏览器。`,
		dataDir: ctx.dataDir,
		store,
		timeoutMs: 180_000,
		log: ctx.log,
	});
	ctx.log(`feishu turn3: ${t3.status} ${t3.stepStatuses.join(",")} result=${t3.resultText}`);
	turns.push(
		turnChecks("feishu.turn3.bitable", t3, [
			check("feishu.turn3.usedCli", t3.skills.includes("office.cli"), t3.skills.join(",")),
			check(
				"feishu.turn3.notFailed",
				t3.status === "success" || t3.status === "partial",
				`${t3.status} ${t3.error ?? ""}`,
			),
			check(
				"feishu.turn3.noBrowserHitl",
				!t3.asks.some((a) => /Chrome|浏览器/.test(a)),
				t3.asks.join(";"),
			),
		]),
	);

	return turns;
}

/** 需要飞书已登录；日历 / 附件真写。 */
async function requireFeishu(ctx: ScenarioCtx): Promise<TurnResult[] | null> {
	const channels = await probeOfficeChannels();
	const feishu = channels.find((c) => c.id === "feishu");
	if (!feishu?.installed || !feishu.authed) {
		return [
			{
				label: "feishu.prereq",
				skipped: `lark-cli 未就绪: installed=${feishu?.installed} authed=${feishu?.authed}`,
				checks: [check("journey.skipped", true, "SKIP")],
			},
		];
	}
	if (!hasPlannerApiKey()) {
		return [
			{
				label: "planner.prereq",
				skipped: "no planner API key",
				checks: [check("journey.skipped", true, "SKIP")],
			},
		];
	}
	return null;
}

/** 旅程：飞书日历建日程（真创建） */
async function runJourneyCalendar(ctx: ScenarioCtx): Promise<TurnResult[]> {
	const skip = await requireFeishu(ctx);
	if (skip) return skip;

	const turns: TurnResult[] = [];
	const store = new ContextStore();
	const stamp = `Fold压测会${Date.now()}`;
	// 明天 15:00–16:00 本地时区
	const start = new Date();
	start.setDate(start.getDate() + 1);
	start.setHours(15, 0, 0, 0);
	const end = new Date(start.getTime() + 60 * 60 * 1000);
	const startIso = start.toISOString();
	const endIso = end.toISOString();

	ctx.log(`calendar starting: ${stamp} ${startIso} → ${endIso}`);
	const t1 = await playTurn({
		intent: `用飞书日历创建一个日程：标题「${stamp}」，开始时间 ${startIso}，结束时间 ${endIso}，说明里写「压测自动创建」`,
		dataDir: ctx.dataDir,
		store,
		log: ctx.log,
		timeoutMs: 120_000,
	});
	ctx.log(`calendar: ${t1.status} ${t1.elapsedMs}ms skills=${t1.skills.join(",")} result=${t1.resultText}`);
	turns.push(
		turnChecks("calendar.create", t1, [
			check("calendar.usedCli", t1.skills.includes("office.cli"), t1.skills.join(",")),
			check(
				"calendar.success",
				t1.status === "success" || t1.status === "partial",
				`${t1.status} ${t1.error ?? ""}`,
			),
			check(
				"calendar.notFakeSend",
				!/发送已跳过|未确认/.test(t1.resultText ?? ""),
				t1.resultText,
			),
		]),
	);
	return turns;
}

/** 旅程：续接 — 把桌面 PDF 当附件发给自己 */
async function runJourneyAttach(ctx: ScenarioCtx): Promise<TurnResult[]> {
	const skip = await requireFeishu(ctx);
	if (skip) return skip;

	const turns: TurnResult[] = [];
	const store = new ContextStore();
	const pdfPath = seedRealPdf();
	const stamp = `Fold压测附件${Date.now()}`;
	try {
		store.push({
			type: "file.created",
			source: "finder",
			timestamp: Date.now(),
			data: { filePath: pdfPath, appName: "Finder" },
		});

		// Turn1: 先读 PDF 落 episode（「前面的」）
		ctx.log("attach turn1: 读桌面报价");
		const t1 = await playTurn({
			intent: "读一下桌面上刚放的报价 PDF，告诉我金额",
			dataDir: ctx.dataDir,
			store,
			log: ctx.log,
		});
		ctx.log(`attach turn1: ${t1.status} skills=${t1.skills.join(",")}`);
		turns.push(
			turnChecks("attach.read", t1, [
				check(
					"attach.read.usedPdf",
					t1.skills.some((s) => /finder|pdf/.test(s)),
					t1.skills.join(","),
				),
			]),
		);

		// Turn2: Drive 上传 + 链接发给自己（im --file 需 im:resource，当前走云文档链接）
		ctx.log(`attach turn2: 上传并发给自己 path=${pdfPath}`);
		const t2 = await playTurn({
			intent: `把本地文件 ${pdfPath} 用飞书云空间（drive +upload）上传，然后在飞书给我自己发一条消息，文字里写「${stamp}」并附上上传后的云文档链接`,
			dataDir: ctx.dataDir,
			store,
			log: ctx.log,
			timeoutMs: 150_000,
		});
		ctx.log(`attach turn2: ${t2.status} skills=${t2.skills.join(",")} result=${t2.resultText}`);
		turns.push(
			turnChecks("attach.send", t2, [
				check("attach.send.usedCli", t2.skills.includes("office.cli"), t2.skills.join(",")),
				check(
					"attach.send.success",
					t2.status === "success" || t2.status === "partial",
					`${t2.status} ${t2.error ?? ""}`,
				),
				check(
					"attach.send.hasLinkOrUpload",
					/上传|链接|feishu\.cn\/file|消息已发送|文件已上传/i.test(t2.resultText ?? ""),
					t2.resultText,
				),
				check(
					"attach.send.notFakeSkip",
					!/发送已跳过|未确认/.test(t2.resultText ?? ""),
					t2.resultText,
				),
			]),
		);
		return turns;
	} finally {
		cleanupSeed(pdfPath);
	}
}

/** 旅程：难任务 → WorkBuddy 分流（默认只验路由 + 探活；live 需网关） */
async function runJourneyWorkbuddy(ctx: ScenarioCtx): Promise<TurnResult[]> {
	const turns: TurnResult[] = [];
	const simulatedFail = {
		stepId: "seed",
		skill: "office.cli",
		status: "failed" as const,
		durationMs: 1,
		error: "simulated fold failure for workbuddy routing",
		retryable: true,
	};
	const baseCtx = {
		liveContext: createEmptyContext(),
		failures: [simulatedFail],
		validationFailed: true,
		agentsEnabled: false,
		availableAgents: [] as [],
		cdpConnected: false,
		uitarsEnabled: false,
		uitarsAvailable: false,
		screenCaptureAvailable: false,
		screenshotSucceeded: false,
		repairAttempts: 0,
		maxRepairAttempts: 2,
	};
	const whenAvailable = selectRepairBackend(
		{ ...baseCtx, intent: WORKBUDDY_HARD_INTENT, workbuddyAvailable: true, workbuddyToolNames: [] },
		0,
	);
	const whenUnavailable = selectRepairBackend(
		{ ...baseCtx, intent: WORKBUDDY_HARD_INTENT, workbuddyAvailable: false },
		0,
	);
	const whenMismatched = selectRepairBackend(
		{
			...baseCtx,
			intent: WORKBUDDY_HARD_INTENT,
			workbuddyAvailable: true,
			workbuddyToolNames: ["ardot_create_design", "conversation_search"],
		},
		0,
	);
	const whenMatched = selectRepairBackend(
		{
			...baseCtx,
			intent: WORKBUDDY_FIT_INTENT,
			workbuddyAvailable: true,
			workbuddyToolNames: ["ardot_create_design", "conversation_search"],
		},
		0,
	);
	turns.push({
		label: "workbuddy.routing",
		checks: [
			check(
				"workbuddy.routing.prefersWhenAvailable",
				whenAvailable === "workbuddy",
				whenAvailable,
			),
			check(
				"workbuddy.routing.notWhenUnavailable",
				whenUnavailable !== "workbuddy",
				whenUnavailable,
			),
			check(
				"workbuddy.routing.skipsToolMismatch",
				whenMismatched !== "workbuddy",
				whenMismatched,
			),
			check(
				"workbuddy.routing.prefersWhenToolsFit",
				whenMatched === "workbuddy",
				whenMatched,
			),
		],
	});

	const probe = await probeWorkBuddyGateway({ requireEnabled: false });
	const toolNames = probe.toolNames ?? [];
	const hardFits = workbuddyToolsFitIntent(WORKBUDDY_HARD_INTENT, toolNames);
	const fitFits = workbuddyToolsFitIntent(WORKBUDDY_FIT_INTENT, toolNames);
	ctx.log(
		`workbuddy probe: available=${probe.available} tools=${toolNames.length} hardFits=${hardFits} fitFits=${fitFits} error=${probe.error ?? ""}`,
	);
	turns.push({
		label: "workbuddy.probe",
		checks: [
			check(
				"workbuddy.probe.completed",
				true,
				JSON.stringify({
					available: probe.available,
					enabled: probe.enabled,
					toolCount: probe.toolCount ?? toolNames.length,
					hardFits,
					fitFits,
					error: probe.error ?? null,
				}),
			),
		],
	});

	if (!probe.available) {
		turns.push({
			label: "journey-workbuddy.live",
			skipped: `WorkBuddy 网关不可用（${probe.error ?? "unavailable"}）— 安装登录后设 FOLD_STRESS_WORKBUDDY=1 跑 live`,
			checks: [check("journey.skipped", true, "SKIP")],
		});
		return turns;
	}

	if (process.env.FOLD_STRESS_WORKBUDDY !== "1") {
		turns.push({
			label: "journey-workbuddy.live",
			skipped: "网关可用；设 FOLD_STRESS_WORKBUDDY=1 跑 live 难任务分流",
			checks: [check("journey.skipped", true, "SKIP")],
		});
		return turns;
	}

	if (!hasPlannerApiKey()) {
		turns.push({
			label: "journey-workbuddy.live",
			skipped: "no planner API key",
			checks: [check("journey.skipped", true, "SKIP")],
		});
		return turns;
	}

	const liveIntent = fitFits
		? WORKBUDDY_FIT_INTENT
		: hardFits
			? WORKBUDDY_HARD_INTENT
			: null;
	if (!liveIntent) {
		turns.push({
			label: "journey-workbuddy.live",
			skipped: `MCP 工具与压测意图都不匹配（tools=${toolNames.slice(0, 8).join(",") || "none"}）`,
			checks: [check("journey.skipped", true, "SKIP")],
		});
		return turns;
	}

	const store = new ContextStore();
	ctx.log(`workbuddy live starting: ${liveIntent}`);
	const t1 = await playTurn({
		intent: liveIntent,
		dataDir: ctx.dataDir,
		store,
		timeoutMs: 180_000,
		envPatches: { FOLD_EXECUTION_MODE: "auto" },
		log: ctx.log,
	});
	ctx.log(
		`workbuddy live: ${t1.status} ${t1.elapsedMs}ms skills=${t1.skills.join(",")} result=${t1.resultText}`,
	);
	const usedWorkbuddy =
		t1.skills.includes("workbuddy.run") ||
		/WorkBuddy|正在调用 WorkBuddy/i.test(
			`${t1.resultText ?? ""} ${t1.asks.join(" ")} ${t1.stepStatuses.join(" ")}`,
		);
	turns.push(
		turnChecks("workbuddy.live", t1, [
			check("workbuddy.live.usedOrMentioned", usedWorkbuddy, t1.skills.join(",")),
			check(
				"workbuddy.live.notHardFail",
				t1.status === "success" || t1.status === "partial" || usedWorkbuddy,
				`${t1.status} ${t1.error ?? ""}`,
			),
		]),
	);
	return turns;
}

/** compiled 自聊应秒级；日历第二次应走 recipe 且明显快于冷启动 planner。 */
async function runJourneyFastpath(ctx: ScenarioCtx): Promise<TurnResult[]> {
	const channels = await probeOfficeChannels();
	const feishu = channels.find((c) => c.id === "feishu");
	if (!feishu?.installed || !feishu.authed) {
		return [
			{
				label: "journey-fastpath",
				skipped: `lark-cli 未就绪: installed=${feishu?.installed} authed=${feishu?.authed}`,
				checks: [check("journey.skipped", true, "SKIP")],
			},
		];
	}

	const turns: TurnResult[] = [];
	const store = new ContextStore();
	const stamp = `Fold快路径${Date.now()}`;
	const selfIntent = `在飞书给我自己发一条消息：${stamp}`;

	const pre = tryCompiledPlan(selfIntent, ctx.dataDir);
	turns.push({
		label: "fastpath.compiled.pre",
		checks: [
			check("fastpath.compiled.isHardcoded", pre?.source === "hardcoded", pre?.source ?? "null"),
		],
	});

	ctx.log(`fastpath compiled turn1: ${selfIntent}`);
	const t1 = await playTurn({
		intent: selfIntent,
		dataDir: ctx.dataDir,
		store,
		timeoutMs: 30_000,
		log: ctx.log,
	});
	ctx.log(`fastpath turn1: ${t1.status} ${t1.elapsedMs}ms`);
	turns.push(
		turnChecks("fastpath.compiled.t1", t1, [
			check("fastpath.compiled.t1.success", t1.status === "success", `${t1.status} ${t1.error ?? ""}`),
			check(
				"fastpath.compiled.t1.under8s",
				t1.elapsedMs < 8_000,
				`${t1.elapsedMs}ms (expect <8000)`,
			),
		]),
	);

	const selfIntent2 = `在飞书给我自己发一条消息：${stamp} 再发`;
	const t2 = await playTurn({
		intent: selfIntent2,
		dataDir: ctx.dataDir,
		store,
		timeoutMs: 30_000,
		log: ctx.log,
	});
	ctx.log(`fastpath turn2: ${t2.status} ${t2.elapsedMs}ms`);
	turns.push(
		turnChecks("fastpath.compiled.t2", t2, [
			check("fastpath.compiled.t2.success", t2.status === "success", `${t2.status} ${t2.error ?? ""}`),
			check(
				"fastpath.compiled.t2.under8s",
				t2.elapsedMs < 8_000,
				`${t2.elapsedMs}ms (expect <8000)`,
			),
		]),
	);

	if (!hasPlannerApiKey()) {
		turns.push({
			label: "fastpath.recipe",
			skipped: "no planner API key — 跳过日历 recipe 冷/热对比",
			checks: [check("journey.skipped", true, "SKIP")],
		});
		return turns;
	}

	const start = new Date();
	start.setDate(start.getDate() + 1);
	start.setHours(16, 0, 0, 0);
	const end = new Date(start.getTime() + 60 * 60 * 1000);
	const calCold = `用飞书日历创建一个日程：标题「${stamp}冷」，开始时间 ${start.toISOString()}，结束时间 ${end.toISOString()}，说明里写「快路径冷」`;
	ctx.log(`fastpath calendar cold: ${calCold}`);
	const cold = await playTurn({
		intent: calCold,
		dataDir: ctx.dataDir,
		store,
		timeoutMs: 120_000,
		log: ctx.log,
	});
	ctx.log(`fastpath cold: ${cold.status} ${cold.elapsedMs}ms skills=${cold.skills.join(",")}`);
	turns.push(
		turnChecks("fastpath.recipe.cold", cold, [
			check(
				"fastpath.recipe.cold.ok",
				cold.status === "success" || cold.status === "partial",
				`${cold.status} ${cold.error ?? ""}`,
			),
		]),
	);

	const start2 = new Date(start.getTime() + 24 * 60 * 60 * 1000);
	const end2 = new Date(start2.getTime() + 60 * 60 * 1000);
	const calWarm = `用飞书日历创建一个日程：标题「${stamp}热」，开始时间 ${start2.toISOString()}，结束时间 ${end2.toISOString()}，说明里写「快路径热」`;
	const recipeHit = tryCompiledPlan(calWarm, ctx.dataDir);
	turns.push({
		label: "fastpath.recipe.match",
		checks: [
			check(
				"fastpath.recipe.hit",
				recipeHit?.source === "recipe",
				recipeHit?.source ?? "null",
			),
		],
	});

	if (recipeHit?.source !== "recipe") {
		turns.push({
			label: "fastpath.recipe.warm",
			skipped: "冷启动后未晋升 recipe（可能校验未过），跳过热路径",
			checks: [check("journey.skipped", true, "SKIP")],
		});
		return turns;
	}

	ctx.log(`fastpath calendar warm: ${calWarm}`);
	const warm = await playTurn({
		intent: calWarm,
		dataDir: ctx.dataDir,
		store,
		timeoutMs: 60_000,
		log: ctx.log,
	});
	ctx.log(`fastpath warm: ${warm.status} ${warm.elapsedMs}ms`);
	turns.push(
		turnChecks("fastpath.recipe.warm", warm, [
			check(
				"fastpath.recipe.warm.ok",
				warm.status === "success" || warm.status === "partial",
				`${warm.status} ${warm.error ?? ""}`,
			),
			check(
				"fastpath.recipe.warm.under15s",
				warm.elapsedMs < 15_000,
				`${warm.elapsedMs}ms (expect <15000)`,
			),
			check(
				"fastpath.recipe.warmVsCold",
				warm.elapsedMs <= cold.elapsedMs,
				`warm=${warm.elapsedMs}ms cold=${cold.elapsedMs}ms`,
			),
		]),
	);
	return turns;
}

/**
 * 难意图 → resolveTier(react) → runTask → agent.execute → 回传。
 * 默认 SKIP（碰钥匙串）；FOLD_STRESS_LIVE_AGENT=1 开启。
 */
async function runJourneyLocalAgent(ctx: ScenarioCtx): Promise<TurnResult[]> {
	if (process.env.FOLD_STRESS_LIVE_AGENT !== "1") {
		return [
			{
				label: "journey-local-agent",
				skipped:
					"set FOLD_STRESS_LIVE_AGENT=1 to route hard intent via runTask → local Agent (may prompt Keychain)",
				checks: [check("journey.skipped", true, "SKIP")],
			},
		];
	}

	const turns: TurnResult[] = [];
	const prevAllow = process.env.FOLD_ALLOW_AGENT_SUBAGENTS;
	const prevMode = process.env.FOLD_EXECUTION_MODE;
	process.env.FOLD_ALLOW_AGENT_SUBAGENTS = "1";
	process.env.FOLD_EXECUTION_MODE = "local_agent";

	try {
		const probes = await probeAllAgents();
		const available = probes.filter((p) => p.available);
		turns.push({
			label: "local-agent.probe",
			checks: [
				check(
					"local-agent.probe.hasCli",
					available.length > 0,
					probes.map((p) => `${p.id}:${p.available}`).join(",") || "none",
				),
			],
		});
		if (available.length === 0) {
			turns.push({
				label: "journey-local-agent.live",
				skipped: "no local agent CLI available (claude/codex/agent)",
				checks: [check("journey.skipped", true, "SKIP")],
			});
			return turns;
		}

		const repoDir = join(ctx.dataDir, "hard-agent-repo");
		mkdirSync(repoDir, { recursive: true });
		const readmePath = join(repoDir, "README.md");
		writeFileSync(readmePath, "FoldStres\n", "utf8");

		const hardIntent = `帮我修一下这个仓库里的 bug：把 ${readmePath} 第一行的拼写错误 FoldStres 改成 FoldStress，只改这一处，不要改其他文件`;

		const route = resolveTier(
			hardIntent,
			createEmptyContext(),
			{
				probes: [
					{
						id: "agent.available",
						status: "ok",
						exclusiveResource: "none",
						sideEffect: "none",
						value: {
							enabled: true,
							agents: available.map((p) => p.id),
							preferred: available[0]!.id,
						},
					},
					{
						id: "skill.registry",
						status: "ok",
						exclusiveResource: "none",
						sideEffect: "none",
						value: { skills: ["agent.execute", "office.cli"] },
					},
				],
			},
			ctx.dataDir,
		);
		turns.push({
			label: "local-agent.route",
			checks: [
				check("local-agent.route.react", route.tier === "react", `${route.tier}: ${route.reason}`),
			],
		});

		const store = new ContextStore();
		ctx.log(`local-agent live: ${hardIntent}`);
		const t1 = await playTurn({
			intent: hardIntent,
			dataDir: ctx.dataDir,
			store,
			timeoutMs: 180_000,
			agentCwd: repoDir,
			envPatches: {
				FOLD_EXECUTION_MODE: "local_agent",
				FOLD_ALLOW_AGENT_SUBAGENTS: "1",
			},
			log: ctx.log,
		});
		ctx.log(
			`local-agent live: ${t1.status} ${t1.elapsedMs}ms skills=${t1.skills.join(",")} result=${t1.resultText}`,
		);

		const usedAgent = t1.skills.includes("agent.execute");
		const after = readFileSync(readmePath, "utf8");
		const fixed = /^\s*FoldStress\s*$/m.test(after);
		turns.push(
			turnChecks(
				"local-agent.live",
				t1,
				[
					check("local-agent.live.usedAgent", usedAgent, t1.skills.join(",")),
					check(
						"local-agent.live.returned",
						t1.status === "success" || t1.status === "partial",
						`${t1.status} ${t1.error ?? ""} ${t1.resultText ?? ""}`,
					),
					check(
						"local-agent.live.fileFixed",
						fixed,
						`README after fix: ${JSON.stringify(after.slice(0, 80))}`,
					),
				],
				180_000,
			),
		);
		return turns;
	} finally {
		if (prevAllow === undefined) delete process.env.FOLD_ALLOW_AGENT_SUBAGENTS;
		else process.env.FOLD_ALLOW_AGENT_SUBAGENTS = prevAllow;
		if (prevMode === undefined) delete process.env.FOLD_EXECUTION_MODE;
		else process.env.FOLD_EXECUTION_MODE = prevMode;
	}
}

export const journeyScenarios: Scenario[] = [
	{ id: "journey-quote", name: "旅程：飞书自聊 + 续接读金额", run: runJourneyQuote },
	{ id: "journey-calendar", name: "旅程：飞书日历建日程", run: runJourneyCalendar },
	{ id: "journey-attach", name: "旅程：带上前面的 PDF 附件发给自己", run: runJourneyAttach },
	{ id: "journey-feishu", name: "旅程：飞书自聊 + 多维表格（真实）", run: runJourneyFeishu },
	{
		id: "journey-workbuddy",
		name: "旅程：难任务分流 WorkBuddy（骨架）",
		run: runJourneyWorkbuddy,
	},
	{
		id: "journey-fastpath",
		name: "旅程：compiled 延迟 + recipe 热路径",
		run: runJourneyFastpath,
	},
	{
		id: "journey-local-agent",
		name: "旅程：难意图分流本地 Agent 并回传",
		run: runJourneyLocalAgent,
	},
];
