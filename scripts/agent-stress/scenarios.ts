import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { ContextStore, createEmptyContext } from "@fold/context";
import {
	executeAgent,
	probeAllAgents,
	type AgentResult,
	type AgentTask,
} from "@fold/connectors";
import { buildSubagentHandoff } from "../../packages/connectors/src/agents/handoff.ts";
import { listRecentEpisodes, promoteRecipe, recordRecipeOutcome, saveEpisode } from "@fold/memory";
import {
	formatRelevantEpisodes,
	normalizeUserActionRequest,
	resolveTier,
	runTask,
	tryCompiledPlan,
	type StateEmitter,
} from "@fold/runtime";
import type { ProbeRunResult } from "../../packages/runtime/src/probe-runner.ts";
import { executeSkill, type SkillContext } from "@fold/skills";
import {
	generateAhaGuess,
	ruleBasedAhaReply,
	type AhaGuessInput,
} from "@fold/ai";
import {
	InteractionBroker,
	MemoryInteractionStore,
} from "../../apps/desktop/electron/interaction-broker.ts";
import { check, type Scenario, type ScenarioCtx, type TurnResult } from "./types.ts";

function emptySkillCtx(store: ContextStore, intent = "stress"): SkillContext {
	return {
		liveContext: store.get(),
		previousResults: new Map(),
		emit: () => undefined,
		taskIntent: intent,
	};
}

function withHome<T>(homeDir: string, fn: () => Promise<T>): Promise<T> {
	const prev = process.env.HOME;
	process.env.HOME = homeDir;
	return fn().finally(() => {
		if (prev === undefined) delete process.env.HOME;
		else process.env.HOME = prev;
	});
}

function withEnv<T>(key: string, value: string | undefined, fn: () => T): T {
	const prev = process.env[key];
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
	try {
		return fn();
	} finally {
		if (prev === undefined) delete process.env[key];
		else process.env[key] = prev;
	}
}

async function withEnvAsync<T>(
	key: string,
	value: string | undefined,
	fn: () => Promise<T>,
): Promise<T> {
	const prev = process.env[key];
	if (value === undefined) delete process.env[key];
	else process.env[key] = value;
	try {
		return await fn();
	} finally {
		if (prev === undefined) delete process.env[key];
		else process.env[key] = prev;
	}
}

/** Keep stress runTask from hanging on slow planner / mail. */
function taskSignal(ms = 45_000): AbortSignal {
	return AbortSignal.timeout(ms);
}

function mockAgentProbe(opts: {
	enabled: boolean;
	agents: string[];
}): ProbeRunResult {
	return {
		probes: [
			{
				id: "skill.registry",
				status: "ok",
				exclusiveResource: "none",
				sideEffect: "none",
				value: { skills: ["finder.latestDownload", "pdf.extract", "mail.draft", "office.cli"] },
			},
			{
				id: "agent.available",
				status: "ok",
				exclusiveResource: "none",
				sideEffect: "none",
				value: {
					enabled: opts.enabled,
					agents: opts.agents,
					preferred: opts.agents[0] ?? null,
				},
			},
		],
	};
}

/** 1) Multi-turn history / episode recall */
async function runHistory(ctx: ScenarioCtx): Promise<TurnResult[]> {
	const turns: TurnResult[] = [];

	// Turn A: seed a completed quote episode
	saveEpisode(
		{
			intent: "帮我整理刚下载的报价发给 Jason",
			goal: "整理报价并发邮件",
			plan: {
				goal: "整理报价",
				steps: [
					{
						id: "s1",
						skill: "finder.latestDownload",
						args: { ext: "pdf" },
						dependsOn: [],
						retryable: true,
						timeout: 5000,
					},
				],
				validate: [],
			},
			steps: [
				{
					stepId: "s1",
					skill: "finder.latestDownload",
					status: "success",
					durationMs: 12,
					output: { path: "/tmp/quote.pdf", name: "quote.pdf" },
				},
			],
			status: "success",
			userVisibleResult: "已整理报价 PDF 并起草发给 Jason",
		},
		ctx.dataDir,
	);

	const episodes = listRecentEpisodes(5, ctx.dataDir);
	turns.push({
		label: "seed episode",
		status: "success",
		checks: [
			check("episode.saved", episodes.length >= 1, `count=${episodes.length}`),
			check(
				"episode.intent",
				episodes.some((e) => e.intent.includes("报价")),
				episodes[0]?.intent,
			),
		],
	});

	// Turn B: follow-up intent should recall episode
	const related = formatRelevantEpisodes("上次那个报价 PDF 再发一份", ctx.dataDir);
	turns.push({
		label: "recall via formatRelevantEpisodes",
		checks: [
			check("recall.nonEmpty", related.trim().length > 0, related || "(empty)"),
			check("recall.mentionsQuote", /报价|pdf|Jason/i.test(related), related),
		],
	});

	// Turn C: unrelated intent should not force-match quote episode (topic filter)
	const unrelated = formatRelevantEpisodes("今天日历有几个会议", ctx.dataDir);
	turns.push({
		label: "unrelated intent filter",
		checks: [
			check(
				"unrelated.emptyOrWeak",
				unrelated.trim().length === 0 || !/报价发给 Jason/.test(unrelated),
				unrelated || "(empty)",
			),
		],
	});

	// Turn D: second episode accumulates in same dataDir (no live LLM — covered by failure/e2e)
	saveEpisode(
		{
			intent: "上次那个报价 PDF 再发一份",
			goal: "再次发送报价",
			plan: {
				goal: "再发报价",
				steps: [
					{
						id: "s1",
						skill: "mail.draft",
						args: { to: "Jason" },
						dependsOn: [],
						retryable: true,
						timeout: 5000,
					},
				],
				validate: [],
			},
			steps: [
				{
					stepId: "s1",
					skill: "mail.draft",
					status: "success",
					durationMs: 8,
					output: { draftId: "stress-draft" },
				},
			],
			status: "success",
			userVisibleResult: "已再次起草报价邮件",
		},
		ctx.dataDir,
	);
	const after = listRecentEpisodes(20, ctx.dataDir);
	const followUpRecall = formatRelevantEpisodes("上次下载的报价 PDF 再看看", ctx.dataDir);
	turns.push({
		label: "multi-turn episode accumulate",
		status: "success",
		checks: [
			check("episode.count>=2", after.length >= 2, `count=${after.length}`),
			check(
				"recall.seesQuoteTopic",
				followUpRecall.includes("报价"),
				followUpRecall || "(empty)",
			),
		],
	});

	return turns;
}

/** 2) HITL matrix (broker + skipExecuteOnRestore) */
async function runHitl(_ctx: ScenarioCtx): Promise<TurnResult[]> {
	const turns: TurnResult[] = [];
	const confirm = normalizeUserActionRequest({
		title: "发送前确认",
		message: "将发送到产品讨论群",
		kind: "confirm",
		risk: "external",
		options: [
			{ id: "allow-once", label: "允许这一次", tone: "primary" },
			{ id: "cancel", label: "取消任务", tone: "danger" },
		],
	});

	// allow
	{
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		const live = broker.request(confirm, "发飞书");
		const id = broker.current()!.id;
		const resolution = broker.respond({
			requestId: id,
			optionId: "allow-once",
			modality: "click",
		});
		const answer = await live;
		turns.push({
			label: "allow-once live",
			checks: [
				check("hitl.allow.wasLive", resolution?.wasLive === true),
				check("hitl.allow.answer", answer === "allow-once"),
				check("hitl.allow.cleared", broker.current() === null),
			],
		});
	}

	// cancel
	{
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		const live = broker.request(confirm, "将被取消");
		broker.cancel("用户取消了授权");
		let rejected = false;
		try {
			await live;
		} catch {
			rejected = true;
		}
		turns.push({
			label: "cancel",
			checks: [
				check("hitl.cancel.rejected", rejected),
				check("hitl.cancel.cleared", broker.current() === null),
			],
		});
	}

	// supersede
	{
		const store = new MemoryInteractionStore();
		const broker = new InteractionBroker(store);
		const first = broker.request(confirm, "第一个");
		const second = broker.request(confirm, "第二个");
		let firstRejected = false;
		try {
			await first;
		} catch {
			firstRejected = true;
		}
		broker.respond({
			requestId: broker.current()!.id,
			optionId: "allow-once",
			modality: "click",
		});
		await second;
		turns.push({
			label: "supersede",
			checks: [
				check("hitl.supersede.firstRejected", firstRejected),
				check("hitl.supersede.cleared", broker.current() === null),
			],
		});
	}

	// restored + skipExecuteOnRestore flag preserved on record
	{
		const e2e = normalizeUserActionRequest({
			...confirm,
			runContext: { skipExecuteOnRestore: true },
		});
		const store = new MemoryInteractionStore();
		const first = new InteractionBroker(store);
		void first.request(e2e, "发送飞书 E2E 结果到产品讨论群");
		const restored = new InteractionBroker(store);
		const record = restored.current();
		turns.push({
			label: "restore skipExecute flag",
			checks: [
				check("hitl.restore.pending", record !== null),
				check(
					"hitl.restore.skipFlag",
					record?.runContext?.skipExecuteOnRestore === true,
					JSON.stringify(record?.runContext),
				),
			],
		});
	}

	// spawn policy self-check for full matrix including skip path
	const repoRoot = join(fileURLToPath(new URL(".", import.meta.url)), "../..");
	const policy = spawnSync(
		process.execPath,
		["--import", "tsx", "apps/desktop/electron/hitl-response-policy.self-check.ts"],
		{
			cwd: repoRoot,
			encoding: "utf8",
			env: { ...process.env, ESBUILD_WORKER_THREADS: "0" },
		},
	);
	turns.push({
		label: "hitl-response-policy.self-check",
		status: policy.status === 0 ? "success" : "failed",
		checks: [
			check(
				"policy.selfCheck.exit0",
				policy.status === 0,
				(policy.stderr || policy.stdout).slice(-400),
			),
			check(
				"policy.selfCheck.skipCase",
				(policy.stdout ?? "").includes("restore.skip→noExecuteTask"),
			),
		],
	});

	return turns;
}

/** 3) Failure + recovery surfaces */
async function runFailure(ctx: ScenarioCtx): Promise<TurnResult[]> {
	const turns: TurnResult[] = [];
	const store = new ContextStore();
	mkdirSync(join(ctx.homeDir, "Downloads"), { recursive: true });

	// No matching download
	{
		let err = "";
		try {
			await withHome(ctx.homeDir, () =>
				executeSkill("finder.latestDownload", { ext: "pdf", since: "5m" }, emptySkillCtx(store)),
			);
		} catch (e) {
			err = (e as Error).message;
		}
		turns.push({
			label: "finder empty Downloads",
			status: "failed",
			checks: [
				check(
					"finder.noMatch",
					/No matching download found|未找到匹配文件/i.test(err),
					err,
				),
			],
		});
	}

	// pdf.extract without path
	{
		let err = "";
		try {
			await executeSkill("pdf.extract", {}, emptySkillCtx(store));
		} catch (e) {
			err = (e as Error).message;
		}
		turns.push({
			label: "pdf.extract missing path",
			status: "failed",
			checks: [
				check("pdf.pathRequired", /path required/i.test(err), err),
			],
		});
	}

	// runTask on empty Downloads with mock planner (no live LLM) → fail fast
	{
		const emit: StateEmitter = () => undefined;
		const started = Date.now();
		const result = await withHome(ctx.homeDir, () =>
			withEnvAsync("MOONSHOT_API_KEY", "", () =>
				withEnvAsync("OPENROUTER_API_KEY", "", () =>
					withEnvAsync("FOLD_PLANNER_API_KEY", "", () =>
						runTask("帮我整理刚下载的报价发给 Jason", emit, {
							getLiveContext: () => store.get(),
							dataDir: ctx.dataDir,
							signal: taskSignal(30_000),
						}),
					),
				),
			),
		);
		const elapsed = Date.now() - started;
		turns.push({
			label: "runTask no download (mock planner)",
			status: result.status,
			checks: [
				check(
					"runTask.notSuccess",
					result.status === "failed" ||
						result.status === "partial" ||
						result.status === "canceled",
					result.status,
				),
				check("runTask.boundedTime", elapsed < 30_000, `${elapsed}ms`),
				check(
					"runTask.hasErrorOrFailedStep",
					Boolean(result.error) ||
						result.steps.some((s) => s.status === "failed") ||
						result.status === "canceled",
					result.error ?? result.steps.map((s) => `${s.skill}:${s.status}`).join(","),
				),
			],
		});
	}

	return turns;
}

/** 4) Local agent communication */
async function runLocalAgent(ctx: ScenarioCtx): Promise<TurnResult[]> {
	const turns: TurnResult[] = [];

	// handoff envelope shape (no CLI needed)
	{
		const task: AgentTask = {
			brief: "read first line of README",
			agent: "cursor",
			cwd: ctx.homeDir,
		};
		const result: AgentResult = {
			ok: false,
			agentId: "cursor",
			summary: "agent missing",
			exitCode: 127,
			stderr: "not found",
			events: [],
			artifacts: [],
			memoryCandidates: [],
		};
		const handoff = buildSubagentHandoff(task, result, ["step-a"]);
		turns.push({
			label: "handoff envelope",
			checks: [
				check("handoff.hasGoal", handoff.goal.includes("README"), handoff.goal),
				check("handoff.hasAgentId", handoff.agentId === "cursor"),
				check("handoff.hasFailedSteps", handoff.failedSteps.includes("step-a")),
				check("handoff.hasEvidence", handoff.evidence.length > 0),
				check("handoff.okFalse", handoff.ok === false),
				check("handoff.exitCode", handoff.exitCode === 127),
			],
		});
	}

	// unknown agent
	{
		let err = "";
		const prev = process.env.FOLD_ALLOW_AGENT_SUBAGENTS;
		process.env.FOLD_ALLOW_AGENT_SUBAGENTS = "1";
		try {
			await executeAgent({
				brief: "noop",
				agent: "does-not-exist" as "cursor",
			});
		} catch (e) {
			err = (e as Error).message;
		} finally {
			if (prev === undefined) delete process.env.FOLD_ALLOW_AGENT_SUBAGENTS;
			else process.env.FOLD_ALLOW_AGENT_SUBAGENTS = prev;
		}
		turns.push({
			label: "unknown agent",
			checks: [
				check("agent.unknownThrows", /Unknown agent|不可用|未找到/i.test(err), err),
			],
		});
	}

	// probe + optional live execute (touches macOS Keychain — off by default)
	if (process.env.FOLD_STRESS_LIVE_AGENT !== "1") {
		turns.push({
			label: "probe/live agents",
			skipped:
				"set FOLD_STRESS_LIVE_AGENT=1 to probe CLI auth + execute (may prompt Keychain)",
			checks: [check("agent.live.skipped", true, "SKIP")],
		});
		return turns;
	}

	const probes = await probeAllAgents();
	const available = probes.filter((p) => p.available);
	turns.push({
		label: "probe agents",
		checks: [
			check("probe.ran", probes.length >= 1, probes.map((p) => `${p.id}:${p.available}`).join(",")),
		],
	});

	if (available.length === 0) {
		turns.push({
			label: "live executeAgent",
			skipped: "no local agent CLI available (claude/codex/agent)",
			checks: [check("agent.live.skipped", true, "SKIP")],
		});
		return turns;
	}

	const prev = process.env.FOLD_ALLOW_AGENT_SUBAGENTS;
	process.env.FOLD_ALLOW_AGENT_SUBAGENTS = "1";
	writeFileSync(join(ctx.homeDir, "README.md"), "fold-stress-ok\n");
	try {
		const result = await executeAgent({
			brief: "只读 README.md 第一行，原样输出，不要改任何文件",
			agent: "auto",
			cwd: ctx.homeDir,
			allowEdits: false,
			maxTurns: 3,
			timeoutMs: 90_000,
		});
		turns.push({
			label: "live executeAgent",
			status: result.ok ? "success" : "failed",
			checks: [
				check("agent.live.hasSummary", Boolean(result.summary?.trim()), result.summary),
				check("agent.live.hasAgentId", Boolean(result.agentId), result.agentId),
				check(
					"agent.live.exitOrOk",
					result.ok === true || typeof result.exitCode === "number",
					`ok=${result.ok} exit=${result.exitCode}`,
				),
			],
		});
	} catch (e) {
		turns.push({
			label: "live executeAgent",
			status: "failed",
			checks: [
				check("agent.live.threw", false, (e as Error).message),
			],
		});
	} finally {
		if (prev === undefined) delete process.env.FOLD_ALLOW_AGENT_SUBAGENTS;
		else process.env.FOLD_ALLOW_AGENT_SUBAGENTS = prev;
	}

	return turns;
}

/** 5) Aha structure */
async function runAha(_ctx: ScenarioCtx): Promise<TurnResult[]> {
	const turns: TurnResult[] = [];

	const fixtures: Array<{ label: string; input: AhaGuessInput }> = [
		{
			label: "coding in Cursor",
			input: {
				activeApp: "Cursor",
				confidenceLevel: "high",
				appTrail: [{ app: "Cursor" }, { app: "Terminal" }],
				recentPages: [],
			},
		},
		{
			label: "product research tabs",
			input: {
				activeApp: "Google Chrome",
				confidenceLevel: "medium",
				recentPages: [
					{ title: "Typeless Pricing", url: "https://typeless.com/pricing" },
					{ title: "闪电说 - 首页", url: "https://www.shandianshuo.cn/" },
					{ title: "Cursor", url: "https://cursor.com" },
				],
			},
		},
		{
			label: "low confidence empty",
			input: {
				activeApp: "Finder",
				confidenceLevel: "low",
				recentPages: [],
				appTrail: [],
			},
		},
	];

	for (const fixture of fixtures) {
		const reply = ruleBasedAhaReply(fixture.input);
		turns.push({
			label: `ruleBased: ${fixture.label}`,
			checks: [
				check("aha.nonEmpty", reply.trim().length > 0, reply),
				check("aha.chinese", /[\u4e00-\u9fff]/.test(reply), reply),
			],
		});
	}

	const cloudOff = await generateAhaGuess(fixtures[1]!.input, { allowCloud: false });
	turns.push({
		label: "generateAhaGuess allowCloud=false",
		checks: [
			check("aha.cloudOff.nonEmpty", cloudOff.trim().length > 0, cloudOff),
			check("aha.cloudOff.chinese", /[\u4e00-\u9fff]/.test(cloudOff), cloudOff),
		],
	});

	// optional cloud path — structure only
	const cloudOn = await generateAhaGuess(fixtures[1]!.input, { allowCloud: true });
	turns.push({
		label: "generateAhaGuess allowCloud=true",
		checks: [
			check("aha.cloudOn.nonEmpty", cloudOn.trim().length > 0, cloudOn),
			check("aha.cloudOn.chinese", /[\u4e00-\u9fff]/.test(cloudOn), cloudOn),
		],
	});

	return turns;
}

/** 6) resolveTier routing matrix — Fold vs local agent */
async function runRouter(_ctx: ScenarioCtx): Promise<TurnResult[]> {
	const turns: TurnResult[] = [];
	const empty = createEmptyContext();
	const withAgents = mockAgentProbe({ enabled: true, agents: ["claude-code"] });
	const noAgents = mockAgentProbe({ enabled: true, agents: [] });
	const agentsDisabled = mockAgentProbe({ enabled: false, agents: [] });

	type Case = {
		label: string;
		mode: "auto" | "local_agent" | "fold_only";
		intent: string;
		probe: ProbeRunResult;
		expectTier: "compiled" | "plan" | "react";
		reasonIncludes?: RegExp;
	};

	const cases: Case[] = [
		{
			label: "clipboard → compiled",
			mode: "auto",
			intent: "刚才剪贴板里那句话是什么",
			probe: withAgents,
			expectTier: "compiled",
		},
		{
			label: "feishu fast channel stays Fold",
			mode: "auto",
			intent: "给飞书产品讨论群发一条消息",
			probe: withAgents,
			expectTier: "plan",
			reasonIncludes: /fast channel/i,
		},
		{
			label: "code + agents + auto → react",
			mode: "auto",
			intent: "帮我修一下这个仓库里的 bug",
			probe: withAgents,
			expectTier: "react",
			reasonIncludes: /delegated to user agent|complex/i,
		},
		{
			label: "code + no agents + auto → plan fallback",
			mode: "auto",
			intent: "帮我修一下这个仓库里的 bug",
			probe: noAgents,
			expectTier: "plan",
			// auto 模式：agents 空时 wantsAgent 不进 react，落 default planner（等同 Fold 自己跑）
		},
		{
			label: "code + fold_only → plan",
			mode: "fold_only",
			intent: "帮我修一下这个仓库里的 bug",
			probe: withAgents,
			expectTier: "plan",
			reasonIncludes: /fold_only/i,
		},
		{
			label: "code + local_agent + agents → react",
			mode: "local_agent",
			intent: "帮我 refactor 这个项目",
			probe: withAgents,
			expectTier: "react",
			reasonIncludes: /local_agent/i,
		},
		{
			label: "code + local_agent + no CLI → plan fallback",
			mode: "local_agent",
			intent: "帮我修一下这个仓库里的 bug",
			probe: noAgents,
			expectTier: "plan",
			reasonIncludes: /no CLI|falling back|Fold/i,
		},
		{
			label: "agents disabled → no react for code",
			mode: "auto",
			intent: "帮我写个测试 fix bug",
			probe: agentsDisabled,
			expectTier: "plan",
		},
		{
			label: "simple quote intent → plan",
			mode: "auto",
			intent: "帮我整理刚下载的报价发给 Jason",
			probe: withAgents,
			expectTier: "plan",
			reasonIncludes: /default planner|fast channel|fold/i,
		},
	];

	for (const c of cases) {
		const route = withEnv("FOLD_EXECUTION_MODE", c.mode, () =>
			resolveTier(c.intent, empty, c.probe),
		);
		turns.push({
			label: c.label,
			status: route.tier,
			checks: [
				check(
					`tier=${c.expectTier}`,
					route.tier === c.expectTier,
					`got ${route.tier}: ${route.reason}`,
				),
				check(
					"reason",
					c.reasonIncludes ? c.reasonIncludes.test(route.reason) : true,
					route.reason,
				),
			],
		});
	}

	return turns;
}

/** Recipe promote → match → demote. */
async function runRecipe(ctx: ScenarioCtx): Promise<TurnResult[]> {
	const turns: TurnResult[] = [];
	const intent1 =
		"用飞书日历创建一个日程：标题「FoldRecipeA」，开始时间 2026-07-18T15:00:00.000Z，结束时间 2026-07-18T16:00:00.000Z，说明里写压测";
	const plan = {
		goal: "create calendar event",
		steps: [
			{
				id: "cal",
				skill: "office.cli",
				args: {
					channel: "feishu",
					args: [
						"calendar",
						"+create",
						"--summary",
						"FoldRecipeA",
						"--start",
						"2026-07-18T15:00:00.000Z",
						"--end",
						"2026-07-18T16:00:00.000Z",
					],
				},
				retryable: true,
				timeout: 10_000,
			},
		],
		validate: ["office.cli.exitOk"],
	};

	const ep = saveEpisode(
		{
			intent: intent1,
			goal: plan.goal,
			plan,
			steps: [{ stepId: "cal", skill: "office.cli", status: "success", durationMs: 5 }],
			status: "success",
			userVisibleResult: "飞书：日程已创建",
			validationChecks: [{ rule: "office.cli.exitOk", passed: true }],
		},
		ctx.dataDir,
	);
	const recipe = promoteRecipe(ep, ctx.dataDir);
	turns.push({
		label: "promote",
		checks: [
			check("promoted", Boolean(recipe), recipe?.id),
			check(
				"taskClass",
				Boolean(recipe?.taskClass.includes("create_event") || recipe?.taskClass.startsWith("feishu.")),
				recipe?.taskClass,
			),
			check(
				"parameterized",
				Boolean(recipe && JSON.stringify(recipe.planTemplate).includes("{{slots.")),
				recipe ? JSON.stringify(recipe.planTemplate).slice(0, 240) : "",
			),
		],
	});

	const intent2 =
		"用飞书日历创建一个日程：标题「FoldRecipeB」，开始时间 2026-07-19T10:00:00.000Z，结束时间 2026-07-19T11:00:00.000Z，说明里写压测";
	const compiled = tryCompiledPlan(intent2, ctx.dataDir);
	turns.push({
		label: "match",
		checks: [
			check("compiledHit", Boolean(compiled), compiled?.source),
			check("fromRecipe", compiled?.source === "recipe", compiled?.source),
			check(
				"slotsFilled",
				Boolean(
					compiled &&
						JSON.stringify(compiled.plan).includes("FoldRecipeB") &&
						!JSON.stringify(compiled.plan).includes("{{slots."),
				),
				compiled ? JSON.stringify(compiled.plan).slice(0, 280) : "",
			),
		],
	});

	if (recipe) {
		recordRecipeOutcome(recipe.id, false, ctx.dataDir);
		recordRecipeOutcome(recipe.id, false, ctx.dataDir);
	}
	const afterDemote = tryCompiledPlan(intent2, ctx.dataDir);
	turns.push({
		label: "demote",
		checks: [
			check(
				"noRecipeAfterDemote",
				!afterDemote || afterDemote.source !== "recipe",
				afterDemote?.source ?? "null",
			),
		],
	});

	return turns;
}

export const scenarios: Scenario[] = [
	{ id: "router", name: "执行路由 Fold vs 本地 Agent", run: runRouter },
	{ id: "history", name: "多轮历史 / episode 召回", run: runHistory },
	{ id: "hitl", name: "HITL 交互矩阵", run: runHitl },
	{ id: "failure", name: "失败路径与边界", run: runFailure },
	{ id: "local-agent", name: "本地 Agent 通信", run: runLocalAgent },
	{ id: "aha", name: "Aha 结构回归", run: runAha },
	{ id: "recipe", name: "Recipe 晋升/命中/降级", run: runRecipe },
];
