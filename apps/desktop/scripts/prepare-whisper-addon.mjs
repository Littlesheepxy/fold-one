import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

if (process.platform !== "darwin") process.exit(0);

const require = createRequire(import.meta.url);
const packageDir = dirname(require.resolve("@kutalia/whisper-node-addon/package.json"));
const addonPath = join(packageDir, "dist", `mac-${process.arch}`, "whisper.node");
const inspected = spawnSync("otool", ["-l", addonPath], { encoding: "utf8" });

if (inspected.status !== 0) {
	console.error(inspected.stderr || `无法检查 Whisper addon：${addonPath}`);
	process.exit(inspected.status ?? 1);
}

if (inspected.stdout.includes("path @loader_path")) process.exit(0);

const patched = spawnSync(
	"install_name_tool",
	["-add_rpath", "@loader_path", addonPath],
	{ encoding: "utf8" },
);
if (patched.status !== 0) {
	console.error(patched.stderr || `无法修复 Whisper addon rpath：${addonPath}`);
	process.exit(patched.status ?? 1);
}

console.log("[fold] Whisper addon rpath 已修复");
