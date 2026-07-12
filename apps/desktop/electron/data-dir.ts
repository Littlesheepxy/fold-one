import { existsSync, mkdirSync, renameSync, cpSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { DATA_DIR_NAME } from "./brand.js";

const LEGACY_DIR_NAME = ".fold";

function expandHome(path: string): string {
	return path.replace(/^~(?=$|[/\\])/, homedir());
}

export function resolveDataDir(): string {
	const fromEnv =
		process.env.ZHIGENG_DATA_DIR?.trim() ||
		process.env.FOLD_DATA_DIR?.trim() ||
		join(homedir(), DATA_DIR_NAME);
	return expandHome(fromEnv);
}

export function legacyDataDir(): string {
	const fromEnv = process.env.FOLD_DATA_DIR?.trim();
	if (fromEnv && !process.env.ZHIGENG_DATA_DIR?.trim()) {
		return expandHome(fromEnv);
	}
	return join(homedir(), LEGACY_DIR_NAME);
}

export function migrateLegacyDataDir(): { migrated: boolean; from?: string; to: string } {
	const target = resolveDataDir();
	mkdirSync(target, { recursive: true });

	if (existsSync(join(target, "config.json")) || existsSync(join(target, "fold.db"))) {
		return { migrated: false, to: target };
	}

	const legacy = legacyDataDir();
	if (legacy === target || !existsSync(legacy)) {
		return { migrated: false, to: target };
	}

	try {
		renameSync(legacy, target);
		writeFileSync(
			join(target, "MIGRATED_FROM_FOLD.txt"),
			`Migrated from ${legacy} on ${new Date().toISOString()}\n`,
			"utf8",
		);
		return { migrated: true, from: legacy, to: target };
	} catch {
		cpSync(legacy, target, { recursive: true });
		writeFileSync(
			join(target, "MIGRATED_FROM_FOLD.txt"),
			`Copied from ${legacy} on ${new Date().toISOString()}\n`,
			"utf8",
		);
		return { migrated: true, from: legacy, to: target };
	}
}
