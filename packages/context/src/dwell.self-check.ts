/**
 * dwell self-check — AFK 段不计入停留时长。
 * 用法：pnpm exec tsx packages/context/src/dwell.self-check.ts
 */
import assert from "node:assert/strict";
import { computeFocusDwells } from "./dwell.js";
import { ContextEngine } from "./engine.js";
import type { ContextEvent } from "./types.js";

function appActive(app: string, ts: number, windowTitle?: string): ContextEvent {
	return { id: `e${ts}`, type: "app.active", source: "system", timestamp: ts, data: { appName: app, windowTitle } };
}

const t0 = 1_700_000_000_000;

// 活跃 5min → afk 10min → 活跃 3min：停留应为 8min，不是 18min
{
	const events: ContextEvent[] = [
		appActive("Code", t0),
		{ id: "afk1", type: "user.afk", source: "input", timestamp: t0 + 5 * 60_000, data: {} },
		{ id: "back1", type: "user.active", source: "input", timestamp: t0 + 15 * 60_000, data: {} },
	];
	const dwells = computeFocusDwells(events, t0 + 18 * 60_000);
	assert.equal(dwells.length, 1);
	assert.equal(dwells[0]!.dwellMs, 8 * 60_000, `dwell=${dwells[0]!.dwellMs}`);
}

// afk 期间切 app：afk 段整段不计；新 app 从切走时刻正常计时（afk 只暂停不补偿）
{
	const events: ContextEvent[] = [
		appActive("Code", t0),
		{ id: "afk1", type: "user.afk", source: "input", timestamp: t0 + 5 * 60_000, data: {} },
		appActive("Chrome", t0 + 12 * 60_000),
		{ id: "back1", type: "user.active", source: "input", timestamp: t0 + 15 * 60_000, data: {} },
	];
	const dwells = computeFocusDwells(events, t0 + 20 * 60_000);
	const code = dwells.find((d) => d.app === "Code");
	const chrome = dwells.find((d) => d.app === "Chrome");
	assert.equal(code?.dwellMs, 5 * 60_000, `code=${code?.dwellMs}`);
	assert.equal(chrome?.dwellMs, 8 * 60_000, `chrome=${chrome?.dwellMs}`);
}

// 无 afk 事件时行为与旧逻辑一致
{
	const events: ContextEvent[] = [appActive("Code", t0), appActive("Chrome", t0 + 5 * 60_000)];
	const dwells = computeFocusDwells(events, t0 + 10 * 60_000);
	assert.equal(dwells.find((d) => d.app === "Code")?.dwellMs, 5 * 60_000);
	assert.equal(dwells.find((d) => d.app === "Chrome")?.dwellMs, 5 * 60_000);
}

// engine: idle 注入后超过阈值发 user.afk，恢复发 user.active
{
	const emitted: ContextEvent[] = [];
	let idle = 0;
	const engine = new ContextEngine({ getIdleSeconds: () => idle, onEvent: (e) => emitted.push(e) });
	const check = (engine as unknown as { checkAfk(now?: number): void }).checkAfk.bind(engine);

	idle = 200;
	check(t0);
	idle = 300;
	check(t0 + 60_000); // 仍 afk，不重复发
	idle = 1;
	check(t0 + 120_000);

	assert.deepEqual(
		emitted.map((e) => e.type),
		["user.afk", "user.active"],
	);
	engine.stop();
}

console.log("dwell self-check passed");
