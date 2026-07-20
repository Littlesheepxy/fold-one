/** @deprecated use ensure-better-sqlite3.mjs node — kept as a thin alias for existing docs/scripts */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ensure = fileURLToPath(new URL("./ensure-better-sqlite3.mjs", import.meta.url));
const result = spawnSync(process.execPath, [ensure, "node"], { stdio: "inherit" });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
