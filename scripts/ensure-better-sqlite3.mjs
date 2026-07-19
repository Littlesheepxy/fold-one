/**
 * better-sqlite3 只有一份 .node，Node 脚本 (ABI 本机) 与 Electron (ABI 132) 会互相覆盖。
 * 本脚本为两个目标各缓存一份二进制，切换时 copy，未命中才 rebuild。
 *
 *   node scripts/ensure-better-sqlite3.mjs electron
 *   node scripts/ensure-better-sqlite3.mjs node
 */
import { createRequire } from "node:module";
import { copyFileSync, existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const target = process.argv[2];
if (target !== "electron" && target !== "node") {
	console.error("usage: ensure-better-sqlite3.mjs electron|node");
	process.exit(1);
}

const memoryRequire = createRequire(join(root, "packages/memory/package.json"));
const packageDir = dirname(memoryRequire.resolve("better-sqlite3/package.json"));
const binaryPath = join(packageDir, "build/Release/better_sqlite3.node");
const cacheDir = join(root, "node_modules/.cache/fold-better-sqlite3");
const stampPath = join(cacheDir, "current");

mkdirSync(cacheDir, { recursive: true });

function readStamp() {
	if (!existsSync(stampPath)) return null;
	const raw = readFileSync(stampPath, "utf8").trim();
	const [kind, abi] = raw.split(":");
	if ((kind !== "electron" && kind !== "node") || !abi) return null;
	return { kind, abi };
}

function writeStamp(kind, abi) {
	writeFileSync(stampPath, `${kind}:${abi}\n`);
}

function cachePath(kind, abi) {
	return join(cacheDir, `${kind}-${abi}.node`);
}

function electronInfo() {
	const ver = spawnSync(
		"pnpm",
		["--filter", "@fold/desktop", "exec", "node", "-e", "console.log(require('electron/package.json').version)"],
		{ cwd: root, encoding: "utf8" },
	);
	if (ver.status !== 0) throw new Error(`无法读取 Electron 版本:\n${ver.stderr || ver.stdout}`);
	const version = ver.stdout.trim().split("\n").at(-1) ?? "";
	const abiResult = spawnSync(
		"pnpm",
		["--filter", "@fold/desktop", "exec", "electron", "-e", "console.log(process.versions.modules)"],
		{
			cwd: root,
			encoding: "utf8",
			env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
		},
	);
	if (abiResult.status !== 0) {
		throw new Error(`无法探测 Electron ABI:\n${abiResult.stderr || abiResult.stdout}`);
	}
	const abi = abiResult.stdout.trim().split("\n").at(-1) ?? "";
	if (!version || !abi) throw new Error(`无法解析 Electron info: version=${version} abi=${abi}`);
	return { version, abi };
}

function desired() {
	if (target === "node") {
		return { kind: "node", abi: process.versions.modules, version: process.versions.node };
	}
	const { version, abi } = electronInfo();
	return { kind: "electron", abi, version };
}

/** 探测当前二进制是否能被指定 runtime 加载（避免 stamp 过期时污染缓存） */
function probeLoads(kind) {
	if (!existsSync(binaryPath)) return false;
	const probeCode = `try{process.dlopen({exports:{}},${JSON.stringify(binaryPath)});console.log("ok")}catch(e){console.error(e.message);process.exit(1)}`;
	if (kind === "node") {
		const result = spawnSync(process.execPath, ["-e", probeCode], { encoding: "utf8" });
		return result.status === 0;
	}
	const result = spawnSync(
		"pnpm",
		["--filter", "@fold/desktop", "exec", "electron", "-e", probeCode],
		{
			cwd: root,
			encoding: "utf8",
			env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
		},
	);
	return result.status === 0;
}

function saveCurrentToCache() {
	const stamp = readStamp();
	if (!stamp || !existsSync(binaryPath)) return;
	if (!probeLoads(stamp.kind)) return;
	const dest = cachePath(stamp.kind, stamp.abi);
	if (!existsSync(dest)) {
		copyFileSync(binaryPath, dest);
		console.log(`[fold] cached better-sqlite3 ${stamp.kind}:${stamp.abi}`);
	}
}

function activateFromCache(kind, abi) {
	const src = cachePath(kind, abi);
	if (!existsSync(src)) return false;
	mkdirSync(dirname(binaryPath), { recursive: true });
	copyFileSync(src, binaryPath);
	writeStamp(kind, abi);
	console.log(`[fold] better-sqlite3 → ${kind}:${abi} (cache)`);
	return true;
}

function rebuild(kind, version) {
	const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
	const env =
		kind === "node"
			? { ...process.env, npm_config_runtime: "node", npm_config_target: version }
			: {
					...process.env,
					npm_config_runtime: "electron",
					npm_config_target: version,
					npm_config_disturl: "https://electronjs.org/headers",
				};
	const result = spawnSync(npmCommand, ["run", "build-release"], {
		cwd: packageDir,
		stdio: "inherit",
		env,
	});
	if (result.error) throw result.error;
	if (result.status !== 0) process.exit(result.status ?? 1);
}

const want = desired();

if (probeLoads(want.kind)) {
	writeStamp(want.kind, want.abi);
	const dest = cachePath(want.kind, want.abi);
	if (!existsSync(dest) && existsSync(binaryPath)) {
		copyFileSync(binaryPath, dest);
		console.log(`[fold] cached better-sqlite3 ${want.kind}:${want.abi}`);
	}
	process.exit(0);
}

saveCurrentToCache();

if (activateFromCache(want.kind, want.abi)) {
	if (probeLoads(want.kind)) process.exit(0);
	console.warn(`[fold] cache for ${want.kind}:${want.abi} invalid, rebuilding…`);
	try {
		unlinkSync(cachePath(want.kind, want.abi));
	} catch {
		/* ignore */
	}
}

console.log(`[fold] building better-sqlite3 for ${want.kind} (ABI ${want.abi})…`);
rebuild(want.kind, want.version);

if (!existsSync(binaryPath) || !probeLoads(want.kind)) {
	console.error(`[fold] better-sqlite3 rebuild failed for ${want.kind}:${want.abi}`);
	process.exit(1);
}

copyFileSync(binaryPath, cachePath(want.kind, want.abi));
writeStamp(want.kind, want.abi);
console.log(`[fold] better-sqlite3 → ${want.kind}:${want.abi} (built + cached)`);
