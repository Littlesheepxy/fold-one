import assert from "node:assert/strict";
import { runShellDetailed } from "./shell.js";

const controller = new AbortController();
setTimeout(() => controller.abort(), 50);
const result = await runShellDetailed(
	process.execPath,
	["-e", "setTimeout(() => {}, 10_000)"],
	5_000,
	undefined,
	{ signal: controller.signal },
);

assert.equal(result.exitCode, 130);
assert.match(result.stderr, /canceled/i);
console.log("shell cancellation self-check passed");
