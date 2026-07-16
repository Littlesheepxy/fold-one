import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { safeStorage } from "electron";
import { resolveDataDir } from "./data-dir.js";

function secretPath(): string {
	return join(resolveDataDir(), "account.secret");
}

export function saveAccountSecret(apiKey: string): void {
	const dir = resolveDataDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	if (!safeStorage.isEncryptionAvailable()) {
		// ponytail: fallback plaintext only when OS keychain unavailable; migrate when available
		writeFileSync(secretPath(), apiKey, "utf8");
		return;
	}
	const encrypted = safeStorage.encryptString(apiKey);
	writeFileSync(secretPath(), encrypted);
}

export function loadAccountSecret(): string | null {
	const path = secretPath();
	if (!existsSync(path)) return null;
	try {
		const raw = readFileSync(path);
		if (!safeStorage.isEncryptionAvailable()) {
			return raw.toString("utf8").trim() || null;
		}
		// Heuristic: encrypted blobs are binary; legacy plaintext starts with tm_
		const asText = raw.toString("utf8");
		if (asText.startsWith("tm_")) return asText.trim();
		return safeStorage.decryptString(raw);
	} catch {
		return null;
	}
}

export function clearAccountSecret(): void {
	const path = secretPath();
	if (!existsSync(path)) return;
	writeFileSync(path, "");
}
