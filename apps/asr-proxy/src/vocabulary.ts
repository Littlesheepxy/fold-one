/**
 * DashScope 定制热词（vocabulary_id）。
 * 官方：先 create/update vocabulary，识别时 parameters.vocabulary_id。
 * Omni 不支持；仅 Fun-ASR / Paraformer。
 */
import { createHash } from "node:crypto";

const VOCAB_URL =
	process.env.DASHSCOPE_VOCAB_URL ??
	"https://dashscope.aliyuncs.com/api/v1/services/audio/asr/customization";

/** 必须与 session 里 Fun-ASR 模型名一致，否则热词静默不生效。 */
export const FUN_ASR_VOCAB_TARGET_MODEL = "fun-asr-realtime";
const PREFIX = "foldhw";

export interface VocabularyEntry {
	text: string;
	weight: number;
	lang?: "zh" | "en" | "ja";
}

let cachedHash: string | null = null;
let cachedId: string | null = null;

export function detectHotwordLang(text: string): "zh" | "en" | undefined {
	if (/[\u4e00-\u9fff]/.test(text)) return "zh";
	if (/^[a-zA-Z0-9][a-zA-Z0-9\s\-_.+/]*$/.test(text)) return "en";
	return undefined;
}

/** 官方长度：含非 ASCII ≤15；纯 ASCII 空格分段 ≤7。 */
export function isValidHotwordText(text: string): boolean {
	const t = text.trim();
	if (t.length < 2) return false;
	if (/[\u4e00-\u9fff]/.test(t) || /[^\x00-\x7f]/.test(t)) return t.length <= 15;
	return t.split(/\s+/).filter(Boolean).length <= 7 && t.length <= 64;
}

/** 短缩写（ARR/PR）声学易糊成日常词，抬到官方上限 5。 */
export function hotwordWeight(text: string): number {
	const t = text.trim();
	const compact = t.replace(/\s+/g, "");
	if (/^[A-Za-z]{2,4}$/.test(compact)) return 5;
	if (/^[A-Z]{2,5}$/.test(compact)) return 5;
	return 4;
}

/** ARR → 额外挂 "A R R"，提高逐字母念法命中。 */
export function expandHotwordForms(text: string): string[] {
	const t = text.trim();
	const out = [t];
	if (/^[A-Za-z]{2,5}$/.test(t)) {
		out.push(t.toUpperCase().split("").join(" "));
	}
	return out;
}

export function toVocabularyEntries(words: string[], limit = 100): VocabularyEntry[] {
	const seen = new Set<string>();
	const out: VocabularyEntry[] = [];
	for (const raw of words) {
		for (const text of expandHotwordForms(raw)) {
			if (!isValidHotwordText(text)) continue;
			const key = text.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			const lang = detectHotwordLang(text);
			out.push({ text, weight: hotwordWeight(text), ...(lang ? { lang } : {}) });
			if (out.length >= limit) return out;
		}
	}
	return out;
}

/** Fun-ASR context 增强：领域词表（≤400 字）。 */
export function buildAsrContextText(words: string[], limit = 360): string {
	const uniq = [...new Set(words.map((w) => w.trim()).filter(Boolean))];
	if (!uniq.length) return "";
	const head = "领域专名（请优先识别）：";
	let body = uniq.join("、");
	if (head.length + body.length > limit) {
		body = body.slice(0, Math.max(0, limit - head.length - 1));
	}
	return head + body;
}

export function vocabularyContentHash(entries: VocabularyEntry[]): string {
	return createHash("sha256")
		.update(entries.map((e) => `${e.lang ?? ""}:${e.weight}:${e.text}`).join("\n"))
		.digest("hex")
		.slice(0, 24);
}

async function vocabRequest(
	apiKey: string,
	input: Record<string, unknown>,
): Promise<Record<string, unknown>> {
	const res = await fetch(VOCAB_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ model: "speech-biasing", input }),
	});
	const body = (await res.json()) as {
		output?: Record<string, unknown>;
		message?: string;
		code?: string;
	};
	if (!res.ok) {
		throw new Error(body.message ?? body.code ?? `vocabulary HTTP ${res.status}`);
	}
	return body.output ?? {};
}

/**
 * 确保账号下有一份与当前词表一致的 vocabulary_id（create 或 update）。
 * 失败返回 null，调用方应降级为无 bias，不挡识别。
 */
export async function ensureVocabularyId(
	apiKey: string,
	words: string[],
): Promise<string | null> {
	const entries = toVocabularyEntries(words);
	if (!entries.length) return null;
	const hash = vocabularyContentHash(entries);
	if (cachedId && cachedHash === hash) return cachedId;

	try {
		const listed = await vocabRequest(apiKey, {
			action: "list_vocabulary",
			prefix: PREFIX,
			page_index: 0,
			page_size: 10,
		});
		const list =
			(listed.vocabulary_list as Array<{ vocabulary_id?: string; status?: string }> | undefined) ??
			[];
		const existing = list.find((v) => v.vocabulary_id && v.status === "OK")?.vocabulary_id;

		if (existing) {
			await vocabRequest(apiKey, {
				action: "update_vocabulary",
				vocabulary_id: existing,
				vocabulary: entries,
			});
			cachedId = existing;
			cachedHash = hash;
			return existing;
		}

		const created = await vocabRequest(apiKey, {
			action: "create_vocabulary",
			target_model: FUN_ASR_VOCAB_TARGET_MODEL,
			prefix: PREFIX,
			vocabulary: entries,
		});
		const id = String(created.vocabulary_id ?? "").trim();
		if (!id) return null;
		cachedId = id;
		cachedHash = hash;
		return id;
	} catch (err) {
		console.warn("[asr-proxy] vocabulary sync failed:", (err as Error).message);
		return null;
	}
}

/** 测试用：清空内存缓存 */
export function resetVocabularyCache(): void {
	cachedHash = null;
	cachedId = null;
}
