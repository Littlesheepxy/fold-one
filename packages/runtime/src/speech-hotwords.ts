import type { UserProfileData } from "@fold/memory";
import { extractProfileKeywords } from "./profile-brief.js";

/** 与 input-habit-scanner/types.ts 的 PersonalLexiconEntry 保持结构兼容（runtime 不依赖 desktop 包）。 */
export interface SpeechHotwordLexiconEntry {
	surface: string;
	kind?: string;
	source?: string;
}

const DEFAULT_LIMIT = 12;
const MIN_LEN = 2;
const MAX_LEN = 24;

/** 输入法库常见噪声：纯标点、单字母、URL 碎片。 */
function isUsableSurface(surface: string): boolean {
	if (surface.length < MIN_LEN || surface.length > MAX_LEN) return false;
	if (/^[\p{P}\p{S}\s]+$/u.test(surface)) return false;
	if (/^[a-z]$/i.test(surface)) return false;
	return true;
}

function kindRank(kind: string | undefined): number {
	switch (kind) {
		case "hot_word":
			return 0;
		case "text_replacement":
			return 1;
		case "word":
			return 2;
		case "phrase":
			return 3;
		default:
			return 4;
	}
}

function dedupePush(out: string[], seen: Set<string>, word: string): void {
	const key = word.toLowerCase();
	if (seen.has(key)) return;
	seen.add(key);
	out.push(word);
}

/**
 * 合并语音纠错热词：profile 专名优先，输入法词库补充。
 * 输出严格截断（宁少勿多），避免净化 prompt 膨胀反而纠错变糊。
 */
export function resolveSpeechHotwords(input: {
	profile: UserProfileData | null;
	lexicon?: SpeechHotwordLexiconEntry[] | null;
	limit?: number;
}): string[] {
	const limit = input.limit ?? DEFAULT_LIMIT;
	const out: string[] = [];
	const seen = new Set<string>();

	for (const keyword of extractProfileKeywords(input.profile, limit)) {
		dedupePush(out, seen, keyword);
	}

	const sortedLexicon = [...(input.lexicon ?? [])].sort(
		(a, b) => kindRank(a.kind) - kindRank(b.kind),
	);
	for (const entry of sortedLexicon) {
		if (out.length >= limit) break;
		const word = entry.surface.trim();
		if (!isUsableSurface(word)) continue;
		dedupePush(out, seen, word);
	}

	return out.slice(0, limit);
}
