import assert from "node:assert/strict";
import { runShellDetailed } from "./shell.js";

// onStdoutLine 应该在进程运行期间逐行收到输出（而不是等 close 后才拿完整 stdout）。
const lines: string[] = [];
const result = await runShellDetailed(
	process.execPath,
	["-e", "console.log('a'); console.log('b'); console.log('c');"],
	5_000,
	undefined,
	{ onStdoutLine: (line) => lines.push(line) },
);

assert.equal(result.exitCode, 0);
assert.deepEqual(lines, ["a", "b", "c"]);
// 缓冲的 stdout 不受影响，仍是完整内容（旧调用方零改动兼容）。
assert.equal(result.stdout.trim(), "a\nb\nc");

// 跨 chunk 的半行不应触发回调，等换行符补全后才算一行。
const partialLines: string[] = [];
await runShellDetailed(
	process.execPath,
	["-e", "process.stdout.write('x'); setTimeout(() => process.stdout.write('y\\n'), 10);"],
	5_000,
	undefined,
	{ onStdoutLine: (line) => partialLines.push(line) },
);
assert.deepEqual(partialLines, ["xy"]);

console.log("shell stream self-check passed");
