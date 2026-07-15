import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export interface WatchRoot {
	path: string;
	depth: number;
}

/** 默认监听：存在才启用；depth 为相对该根目录向下层数。 */
const DEFAULT_RELATIVE: ReadonlyArray<{ rel: string; depth: number }> = [
	{ rel: "Downloads", depth: 2 },
	{ rel: "Documents", depth: 4 },
	{ rel: "Desktop", depth: 4 },
	{ rel: "Projects", depth: 5 },
	{ rel: "Developer", depth: 5 },
	{ rel: "Code", depth: 5 },
	{ rel: "workspace", depth: 5 },
];

function expandHome(path: string, home = homedir()): string {
	return path.startsWith("~/") ? join(home, path.slice(2)) : path;
}

function dedupeRoots(roots: WatchRoot[]): WatchRoot[] {
	const byPath = new Map<string, WatchRoot>();
	for (const root of roots) {
		const prev = byPath.get(root.path);
		if (!prev || root.depth > prev.depth) byPath.set(root.path, root);
	}
	return [...byPath.values()];
}

/** macOS 用户常用工作目录（存在才监听）。 */
export function defaultWatchRoots(home = homedir()): WatchRoot[] {
	const roots: WatchRoot[] = [];
	for (const { rel, depth } of DEFAULT_RELATIVE) {
		const path = join(home, rel);
		if (existsSync(path)) roots.push({ path, depth });
	}
	return roots;
}

/** 环境变量 `FOLD_WATCH_DIRS`，冒号分隔绝对路径或 `~/...`。 */
export function watchRootsFromEnv(home = homedir()): WatchRoot[] {
	const raw = process.env.FOLD_WATCH_DIRS?.trim();
	if (!raw) return [];
	return raw
		.split(":")
		.map((part) => part.trim())
		.filter(Boolean)
		.map((path) => ({ path: expandHome(path, home), depth: 5 }))
		.filter((root) => existsSync(root.path));
}

export function mergeWatchRoots(...groups: WatchRoot[][]): WatchRoot[] {
	return dedupeRoots(groups.flat());
}

export const FILE_WATCH_IGNORED: RegExp[] = [
	/(^|[/\\])\../,
	/node_modules/,
	/\.git([/\\]|$)/,
	/\.fold([/\\]|$)/,
	/[\/\\]Library[\/\\]/,
	/\.(tmp|swp|lock)$/i,
	/~$/,
	// 构建/依赖目录（Projects 等深层监听时降噪）
	/[\/\\]dist[\/\\]/,
	/[\/\\]build[\/\\]/,
	/[\/\\]\.next[\/\\]/,
	/[\/\\]out[\/\\]/,
	/[\/\\]target[\/\\]/,
	/[\/\\]__pycache__[\/\\]/,
	/[\/\\]\.venv[\/\\]/,
	/[\/\\]vendor[\/\\]/,
	/[\/\\]\.turbo[\/\\]/,
	/[\/\\]\.cache[\/\\]/,
];
