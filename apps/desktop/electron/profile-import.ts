import { clipboard } from "electron";
import { join } from "node:path";
import {
	detectChatPlatforms,
	listChromeTabsViaAppleScript,
	runChatProfileImport,
} from "@fold/connectors";
import { listRecentEpisodes, loadProfileMemories, saveProfileMemories } from "@fold/memory";
import { buildProfileImportPrompt, parseProfileImportResponse } from "@fold/runtime";
import { resolveDataDir } from "./data-dir.js";

function dataDir(): string {
	return resolveDataDir();
}

export interface ProfileImportOption {
	id: string;
	label: string;
	hasOpenTab: boolean;
	tabUrl?: string;
	tabTitle?: string;
	defaultUrl: string;
	automationSupported: boolean;
}

export async function listProfileImportOptions(): Promise<ProfileImportOption[]> {
	const tabs = await listChromeTabsViaAppleScript().catch(() => []);
	return detectChatPlatforms(tabs).map(({ platform, tab }) => ({
		id: platform.id,
		label: platform.label,
		hasOpenTab: Boolean(tab),
		tabUrl: tab?.url,
		tabTitle: tab?.title,
		defaultUrl: platform.homeUrl,
		automationSupported: platform.id === "chatgpt" || platform.id === "claude",
	}));
}

export function buildProfilePrompt(): string {
	const episodes = listRecentEpisodes(30, dataDir());
	return buildProfileImportPrompt(episodes);
}

export function copyProfilePrompt(): string {
	const prompt = buildProfilePrompt();
	clipboard.writeText(prompt);
	return prompt;
}

export async function executeProfileImport(
	platformId: string,
	tabUrl?: string,
): Promise<{ ok: boolean; response?: string; error?: string; prompt: string }> {
	const prompt = buildProfilePrompt();
	const result = await runChatProfileImport(platformId, prompt, tabUrl);
	return { ...result, prompt };
}

export function saveProfileFromResponse(responseText: string): {
	ok: boolean;
	error?: string;
	profile?: ReturnType<typeof loadProfileMemories>;
} {
	const parsed = parseProfileImportResponse(responseText);
	if (!parsed) {
		return { ok: false, error: "未能从回复中解析画像：请确认 AI 已输出 Fold Profile Appendix 中的 JSON" };
	}
	saveProfileMemories({ ...parsed, updatedAt: Date.now() }, `ai-import:${Date.now()}`, dataDir());
	return { ok: true, profile: loadProfileMemories(dataDir()) ?? undefined };
}

export function getStoredProfile() {
	return loadProfileMemories(dataDir());
}
