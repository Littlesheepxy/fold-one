import { chmodSync, copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

if (process.platform !== "darwin") process.exit(0);

const desktopDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = resolve(desktopDir, "../../packages/connectors/native/fold-calendar");
const source = join(sourceDir, "main.swift");
const infoPlist = join(sourceDir, "Info.plist");
const resourceDir = join(desktopDir, "resources", "fold-calendar");
const binary = join(resourceDir, "fold-calendar");

if (!existsSync(source) || !existsSync(infoPlist)) {
	console.error(`[fold] 日历 helper 源码不完整：${sourceDir}`);
	process.exit(1);
}

mkdirSync(resourceDir, { recursive: true });
const isCurrent =
	existsSync(binary) &&
	statSync(binary).mtimeMs >= Math.max(statSync(source).mtimeMs, statSync(infoPlist).mtimeMs);
if (isCurrent) {
	chmodSync(binary, 0o755);
	copyFileSync(infoPlist, join(resourceDir, "Info.plist"));
	console.log(`[fold] 日历 helper 已是最新：${binary}`);
	process.exit(0);
}

const compiled = spawnSync(
	"swiftc",
	[
		"-O",
		"-o",
		binary,
		source,
		"-Xlinker",
		"-sectcreate",
		"-Xlinker",
		"__TEXT",
		"-Xlinker",
		"__info_plist",
		"-Xlinker",
		infoPlist,
	],
	{ encoding: "utf8" },
);
if (compiled.status !== 0) {
	console.error(compiled.stderr || "[fold] 无法编译日历 helper");
	process.exit(compiled.status ?? 1);
}

const signed = spawnSync(
	"codesign",
	["--force", "-s", "-", "--identifier", "com.fold.calendar-cli", binary],
	{ encoding: "utf8" },
);
if (signed.status !== 0) {
	console.warn(signed.stderr || "[fold] 日历 helper ad-hoc 签名失败，将继续使用未签名产物");
}

chmodSync(binary, 0o755);
copyFileSync(infoPlist, join(resourceDir, "Info.plist"));
console.log(`[fold] 日历 helper 已准备：${binary}`);
