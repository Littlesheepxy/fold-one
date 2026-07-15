import { createRequire } from "node:module";
import { dirname } from "node:path";
import { spawnSync } from "node:child_process";

const memoryRequire = createRequire(new URL("../packages/memory/package.json", import.meta.url));
const packageDir = dirname(memoryRequire.resolve("better-sqlite3/package.json"));
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const result = spawnSync(npmCommand, ["run", "build-release"], {
	cwd: packageDir,
	stdio: "inherit",
	env: { ...process.env, npm_config_runtime: "node", npm_config_target: process.versions.node },
});

if (result.error) throw result.error;
process.exit(result.status ?? 1);
