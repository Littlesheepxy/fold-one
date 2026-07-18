import assert from "node:assert/strict";
import { buildScreencaptureArgs } from "./screenshot.js";

// 有 windowId：走 -l，忽略 screenRect（窗口截图优先级高于屏幕矩形）。
assert.deepEqual(buildScreencaptureArgs("/tmp/a.png", 42, { x: 0, y: 0, width: 1512, height: 982 }), [
	"-l42",
	"-x",
	"/tmp/a.png",
]);

// 无 windowId + 有 screenRect：走 -R，截「鼠标所在那块屏」而非固定主屏。
assert.deepEqual(
	buildScreencaptureArgs("/tmp/b.png", null, { x: 1512, y: 0, width: 1920, height: 1080 }),
	["-R1512,0,1920,1080", "-x", "/tmp/b.png"],
);

// 无 windowId + 无 screenRect：退化为默认全屏（无 -l / -R）。
assert.deepEqual(buildScreencaptureArgs("/tmp/c.png", null), ["-x", "/tmp/c.png"]);

console.log("screenshot.self-check: PASS");
