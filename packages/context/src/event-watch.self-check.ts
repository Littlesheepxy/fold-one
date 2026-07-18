/**
 * event-watch self-check — frontAppWatcher 事件驱动 + 慢兜底轮询。
 * 用法：pnpm exec tsx packages/context/src/event-watch.self-check.ts
 */
import assert from "node:assert/strict";
import { ContextEngine } from "./engine.js";
import type { ContextEvent } from "./types.js";

// watcher 注入后：事件回调直接推 app.active，兜底轮询间隔放大
{
	const emitted: ContextEvent[] = [];
	let capturedCb: ((e: { appName: string; appPath?: string }) => void) | undefined;
	let stopped = false;
	const engine = new ContextEngine({
		frontAppWatcher: {
			start: (cb) => {
				capturedCb = cb;
				return { ok: true };
			},
			stop: () => {
				stopped = true;
			},
		},
		onEvent: (e) => emitted.push(e),
	});
	engine.start();
	assert.ok(capturedCb, "watcher.start 应被调用");
	// ponytail: 读取 engine 私有字段验证兜底间隔放大
	const intervalMs = (engine as unknown as { appTimer: { _idleTimeout: number } }).appTimer!._idleTimeout;
	assert.equal(intervalMs, 15_000, `fallback interval=${intervalMs}`);

	capturedCb!({ appName: "Cursor", appPath: "/Applications/Cursor.app" });
	await new Promise((r) => setTimeout(r, 10));
	assert.deepEqual(
		emitted.map((e) => e.type),
		["app.active"],
	);
	assert.equal(emitted[0]!.data.appName, "Cursor");

	engine.stop();
	assert.ok(stopped, "watcher.stop 应被调用");
}

// watcher start 失败时退回 2s 轮询
{
	const engine = new ContextEngine({
		frontAppWatcher: {
			start: () => ({ ok: false, error: "x" }),
			stop: () => {},
		},
	});
	engine.start();
	const intervalMs = (engine as unknown as { appTimer: { _idleTimeout: number } }).appTimer!._idleTimeout;
	assert.equal(intervalMs, 2_000, `fallback interval=${intervalMs}`);
	engine.stop();
}

// 未注入 watcher 时保持 2s 轮询
{
	const engine = new ContextEngine({});
	engine.start();
	const intervalMs = (engine as unknown as { appTimer: { _idleTimeout: number } }).appTimer!._idleTimeout;
	assert.equal(intervalMs, 2_000);
	engine.stop();
}

console.log("event-watch self-check passed");
