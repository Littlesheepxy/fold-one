/**
 * 语音热词回归流水线（TTS → ASR → 净化 → 关键词评分）
 *
 * 1. macOS `say` 合成 V1–V8 WAV（16kHz PCM）
 * 2. 走 DashScope Fun-ASR Realtime（可选 vocabulary_id / 或经 asr-proxy）
 * 3. 本地 applyLocalHotwordHints +（有 key 时）structureSpeechText
 * 4. 打印关键词命中表；exit 1 若命中 < 门槛
 *
 * 用法：
 *   pnpm voice:hotword-pipeline
 *   pnpm exec tsx scripts/voice-hotword-pipeline.ts --proxy=ws://localhost:3003
 *   pnpm exec tsx scripts/voice-hotword-pipeline.ts --skip-asr   # 只测后处理
 */
import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { applyContextualAcronymFixes, applyLocalHotwordHints, structureSpeechText } from "@fold/ai";

const require = createRequire(import.meta.url);
// 复用 asr-proxy 已装的 ws，避免根目录新依赖
const WebSocket = require("../apps/asr-proxy/node_modules/ws") as typeof import("ws");

// ---- cases（对齐 docs/agent-stress-checklist.md V1–V8）----

interface Case {
	id: string;
	utt: string;
	text: string;
	keywords: string[];
}

const CASES: Case[] = [
	{
		id: "V1",
		utt: "utt_017",
		text: "Fast Path 要优先保证 first character latency",
		keywords: ["Fast Path", "first character latency"],
	},
	{
		id: "V2",
		utt: "utt_018",
		text: "这个 resolver 不应该每次重置整段 transcript",
		keywords: ["resolver", "transcript"],
	},
	{
		id: "V3",
		utt: "utt_005",
		text: "InputSurface 和 ThoughtSurface 应该是两个独立的 surface",
		keywords: ["InputSurface", "ThoughtSurface"],
	},
	{
		id: "V4",
		utt: "utt_021",
		text: "这家公司今年 ARR 大概三千万，续费率还可以",
		keywords: ["ARR"],
	},
	{
		id: "V5",
		utt: "utt_007",
		text: "这个项目投前估值十四亿，但是目前还没有收入",
		keywords: ["十四亿"],
	},
	{
		id: "V6",
		utt: "utt_022",
		text: "我们需要确认一下毛利率和销售回款周期",
		keywords: ["毛利率", "回款"],
	},
	{
		id: "V7",
		utt: "utt_004",
		text: "你帮我看一下这个 PR 的 context 有没有问题",
		keywords: ["PR", "context"],
	},
	{
		id: "V8",
		utt: "utt_016",
		text: "帮我 compare 一下这两个 branch 的 diff",
		keywords: ["compare", "branch", "diff"],
	},
];

const ALL_HOTWORDS = [
	...new Set(CASES.flatMap((c) => c.keywords)),
	"InputSurface",
	"ThoughtSurface",
	"Fast Path",
	"ARR",
];

// ---- CLI ----

function arg(flag: string): string | undefined {
	const hit = process.argv.find((a) => a.startsWith(`${flag}=`));
	return hit?.slice(flag.length + 1);
}
function hasFlag(flag: string): boolean {
	return process.argv.includes(flag);
}

const OUT_DIR =
	arg("--out-dir") ??
	join(
		process.cwd(),
		"Experiments/StreamingASRBenchmark/Reports/hotword-pipeline",
	);
const PROXY = arg("--proxy"); // e.g. ws://localhost:3003
const SKIP_ASR = hasFlag("--skip-asr");
const VOICE = arg("--voice") ?? "Tingting";
const PASS_RATIO = Number(arg("--pass-ratio") ?? "0.5"); // TTS 非真人，默认 50% 门槛

const API_KEY = (process.env.DASHSCOPE_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
const VOCAB_URL =
	process.env.DASHSCOPE_VOCAB_URL ??
	"https://dashscope.aliyuncs.com/api/v1/services/audio/asr/customization";
const DASHSCOPE_WS =
	process.env.DASHSCOPE_WS_URL ?? "wss://dashscope.aliyuncs.com/api-ws/v1/inference";

// ---- TTS ----

function synthesizeWav(text: string, outPath: string): void {
	const r = spawnSync(
		"say",
		["-v", VOICE, "-o", outPath, "--data-format=LEI16@16000", text],
		{ encoding: "utf8" },
	);
	if (r.status !== 0) {
		throw new Error(`say failed: ${r.stderr || r.stdout || r.status}`);
	}
	if (!existsSync(outPath)) throw new Error(`wav missing: ${outPath}`);
}

/** 跳过标准 WAV 头，返回 16-bit LE PCM */
function readWavPcm(path: string): Buffer {
	const buf = readFileSync(path);
	if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") {
		throw new Error(`not a wav: ${path}`);
	}
	// 找 data chunk（say 偶发有非标准 chunk 序）
	let offset = 12;
	while (offset + 8 <= buf.length) {
		const id = buf.toString("ascii", offset, offset + 4);
		const size = buf.readUInt32LE(offset + 4);
		if (id === "data") return buf.subarray(offset + 8, offset + 8 + size);
		offset += 8 + size;
	}
	return buf.subarray(44); // fallback
}

// ---- vocabulary (optional) ----

async function ensureVocabularyId(words: string[]): Promise<string | null> {
	if (!API_KEY || words.length === 0) return null;
	const seen = new Set<string>();
	const vocabulary: Array<{ text: string; weight: number; lang: string }> = [];
	for (const raw of words) {
		const forms = [raw.trim()];
		if (/^[A-Za-z]{2,5}$/.test(raw.trim())) {
			forms.push(raw.trim().toUpperCase().split("").join(" "));
		}
		for (const text of forms) {
			if (text.length < 2 || text.length > 15) continue;
			const key = text.toLowerCase();
			if (seen.has(key)) continue;
			seen.add(key);
			const compact = text.replace(/\s+/g, "");
			const weight = /^[A-Za-z]{2,4}$/.test(compact) ? 5 : 4;
			vocabulary.push({
				text,
				weight,
				lang: /[\u4e00-\u9fff]/.test(text) ? "zh" : "en",
			});
			if (vocabulary.length >= 80) break;
		}
		if (vocabulary.length >= 80) break;
	}
	if (!vocabulary.length) return null;

	const post = async (input: Record<string, unknown>) => {
		const res = await fetch(VOCAB_URL, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${API_KEY}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ model: "speech-biasing", input }),
		});
		const body = (await res.json()) as {
			output?: Record<string, unknown>;
			message?: string;
		};
		if (!res.ok) throw new Error(body.message ?? `vocab HTTP ${res.status}`);
		return body.output ?? {};
	};

	try {
		const listed = await post({
			action: "list_vocabulary",
			prefix: "foldhw",
			page_index: 0,
			page_size: 10,
		});
		const list =
			(listed.vocabulary_list as Array<{ vocabulary_id?: string; status?: string }>) ??
			[];
		const existing = list.find((v) => v.status === "OK")?.vocabulary_id;
		if (existing) {
			await post({
				action: "update_vocabulary",
				vocabulary_id: existing,
				vocabulary,
			});
			return existing;
		}
		const created = await post({
			action: "create_vocabulary",
			target_model: "fun-asr-realtime",
			prefix: "foldhw",
			vocabulary,
		});
		return String(created.vocabulary_id ?? "").trim() || null;
	} catch (err) {
		console.warn(`[vocab] sync failed: ${(err as Error).message}`);
		return null;
	}
}

// ---- ASR ----

async function asrViaProxy(
	pcm: Buffer,
	hotWords: string[],
	proxyBase: string,
): Promise<string> {
	const wsUrl = proxyBase.replace(/\/$/, "") + "/asr/stream";
	return await new Promise<string>((resolve, reject) => {
		const ws = new WebSocket(wsUrl);
		let full = "";
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error("asr-proxy timeout"));
		}, 90_000);

		ws.on("open", () => {
			ws.send(
				JSON.stringify({
					type: "start",
					sampleRate: 16000,
					format: "pcm",
					languageHints: ["zh", "en"],
					mode: "structure",
					hotWords,
					model: "fun-asr-realtime",
				}),
			);
		});
		ws.on("message", (data) => {
			let msg: { type: string; fullText?: string; text?: string; message?: string };
			try {
				msg = JSON.parse(data.toString());
			} catch {
				return;
			}
			if (msg.type === "ready") {
				const chunk = 3200; // 100ms @ 16k 16bit mono
				for (let i = 0; i < pcm.length; i += chunk) {
					ws.send(pcm.subarray(i, i + chunk));
				}
				ws.send(JSON.stringify({ type: "finish" }));
			} else if (msg.type === "partial" || msg.type === "final") {
				full = msg.text ?? full;
			} else if (msg.type === "done") {
				clearTimeout(timer);
				full = msg.fullText ?? full;
				ws.close();
				resolve(full.trim());
			} else if (msg.type === "error") {
				clearTimeout(timer);
				reject(new Error(msg.message ?? "asr-proxy error"));
			}
		});
		ws.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

async function asrViaDashscope(
	pcm: Buffer,
	vocabularyId: string | null,
	contextText: string | null,
): Promise<string> {
	if (!API_KEY) throw new Error("DASHSCOPE_API_KEY missing");
	const taskId = randomUUID().replace(/-/g, "");
	return await new Promise<string>((resolve, reject) => {
		const ws = new WebSocket(DASHSCOPE_WS, {
			headers: {
				Authorization: `bearer ${API_KEY}`,
				"X-DashScope-DataInspection": "enable",
			},
		});
		const finals: string[] = [];
		const timer = setTimeout(() => {
			ws.close();
			reject(new Error("dashscope timeout"));
		}, 90_000);

		const sendAudio = () => {
			const chunk = 3200;
			for (let i = 0; i < pcm.length; i += chunk) {
				ws.send(pcm.subarray(i, i + chunk));
			}
			ws.send(
				JSON.stringify({
					header: { action: "finish-task", task_id: taskId, streaming: "duplex" },
					payload: { input: {} },
				}),
			);
		};

		ws.on("open", () => {
			ws.send(
				JSON.stringify({
					header: { action: "run-task", task_id: taskId, streaming: "duplex" },
					payload: {
						task_group: "audio",
						task: "asr",
						function: "recognition",
						model: "fun-asr-realtime",
						parameters: {
							format: "pcm",
							sample_rate: 16000,
							language_hints: ["zh", "en"],
							semantic_punctuation_enabled: true,
							...(vocabularyId ? { vocabulary_id: vocabularyId } : {}),
						},
						input: {},
					},
				}),
			);
		});

		ws.on("message", (data) => {
			let msg: {
				header?: { event?: string; error_message?: string };
				payload?: { output?: { sentence?: { text?: string; sentence_end?: boolean } } };
			};
			try {
				msg = JSON.parse(data.toString());
			} catch {
				return;
			}
			const event = msg.header?.event;
			if (event === "task-started") {
				if (contextText?.trim()) {
					ws.send(
						JSON.stringify({
							header: {
								action: "continue-task",
								task_id: taskId,
								streaming: "duplex",
							},
							payload: {
								input: {
									context: [
										{
											role: "user",
											content: [
												{ type: "input_text", text: contextText.trim().slice(0, 400) },
											],
										},
									],
								},
							},
						}),
					);
				}
				sendAudio();
			} else if (event === "result-generated") {
				const sentence = msg.payload?.output?.sentence;
				if (sentence?.sentence_end && sentence.text) finals.push(sentence.text);
			} else if (event === "task-finished") {
				clearTimeout(timer);
				ws.close();
				resolve(finals.join("").trim());
			} else if (event === "task-failed") {
				clearTimeout(timer);
				reject(new Error(msg.header?.error_message ?? "task-failed"));
			}
		});
		ws.on("error", (err) => {
			clearTimeout(timer);
			reject(err);
		});
	});
}

// ---- score ----

/** 口语数字 ↔ 阿拉伯数字等可接受等价（TTS/ASR 常归一化） */
const KEYWORD_ALIASES: Record<string, string[]> = {
	十四亿: ["14亿", "14 亿"],
	ARR: ["arr", "A R R"],
};

function keywordHit(text: string, kw: string): boolean {
	const norm = (s: string) => s.toLowerCase().replace(/\s+/g, "");
	const hay = norm(text);
	const candidates = [kw, ...(KEYWORD_ALIASES[kw] ?? [])];
	return candidates.some((c) => hay.includes(norm(c)));
}

interface Row {
	id: string;
	text: string;
	asr: string;
	cleaned: string;
	hits: string[];
	misses: string[];
	ok: boolean;
}

// ---- main ----

async function main() {
	mkdirSync(OUT_DIR, { recursive: true });
	console.log(`== Fold 语音热词流水线 ==`);
	console.log(`out: ${OUT_DIR}`);
	console.log(`voice: ${VOICE}`);
	console.log(`asr: ${SKIP_ASR ? "skip" : PROXY ? `proxy ${PROXY}` : "dashscope-direct"}`);
	console.log(`hotwords(${ALL_HOTWORDS.length}): ${ALL_HOTWORDS.join("、")}\n`);

	let vocabularyId: string | null = null;
	if (!SKIP_ASR && !PROXY) {
		vocabularyId = await ensureVocabularyId(ALL_HOTWORDS);
		console.log(`vocabulary_id: ${vocabularyId ?? "(none)"}\n`);
	}

	const rows: Row[] = [];

	for (const c of CASES) {
		const wavPath = join(OUT_DIR, `${c.id}.wav`);
		process.stdout.write(`[${c.id}] TTS… `);
		synthesizeWav(c.text, wavPath);
		const pcm = readWavPcm(wavPath);
		writeFileSync(join(OUT_DIR, `${c.id}.pcm`), pcm);

		let asrText = c.text; // skip-asr 时用原文模拟「完美 STT」
		if (!SKIP_ASR) {
			process.stdout.write(`ASR(${pcm.length}B)… `);
			asrText = PROXY
				? await asrViaProxy(pcm, ALL_HOTWORDS, PROXY)
				: await asrViaDashscope(
						pcm,
						vocabularyId,
						`领域专名（请优先识别）：${ALL_HOTWORDS.join("、")}`,
					);
		}

		const localCleaned = applyContextualAcronymFixes(
			applyLocalHotwordHints(asrText, ALL_HOTWORDS),
			ALL_HOTWORDS,
		);
		let cleaned = localCleaned;
		try {
			const structured = await structureSpeechText(asrText, {
				allowCloud: Boolean(process.env.MOONSHOT_API_KEY || process.env.OPENAI_API_KEY),
				preferQuality: true,
				profileKeywords: ALL_HOTWORDS,
				cleanupLevel: "smart",
			});
			cleaned =
				[structured.headline, structured.detail].filter(Boolean).join("\n") || localCleaned;
		} catch {
			cleaned = localCleaned;
		}

		const hits = c.keywords.filter((kw) => keywordHit(cleaned, kw));
		const misses = c.keywords.filter((kw) => !keywordHit(cleaned, kw));
		const ok = misses.length === 0;
		rows.push({ id: c.id, text: c.text, asr: asrText, cleaned, hits, misses, ok });
		console.log(ok ? "PASS" : `MISS[${misses.join(",")}]`);
		console.log(`  GT : ${c.text}`);
		console.log(`  ASR: ${asrText || "(empty)"}`);
		console.log(`  OUT: ${cleaned || "(empty)"}\n`);
	}

	const pass = rows.filter((r) => r.ok).length;
	const ratio = pass / rows.length;
	const report = {
		generatedAt: new Date().toISOString(),
		voice: VOICE,
		vocabularyId,
		pass,
		total: rows.length,
		ratio,
		rows,
	};
	const reportPath = join(OUT_DIR, "report.json");
	writeFileSync(reportPath, JSON.stringify(report, null, 2));
	writeFileSync(
		join(OUT_DIR, "report.md"),
		[
			`# 语音热词流水线报告`,
			``,
			`- 时间: ${report.generatedAt}`,
			`- 音色: ${VOICE}`,
			`- 通过: **${pass}/${rows.length}** (${(ratio * 100).toFixed(0)}%)`,
			`- vocabulary_id: ${vocabularyId ?? "—"}`,
			``,
			`| ID | 结果 | 命中 | 漏掉 | ASR |`,
			`|----|------|------|------|-----|`,
			...rows.map(
				(r) =>
					`| ${r.id} | ${r.ok ? "PASS" : "MISS"} | ${r.hits.join(", ") || "—"} | ${r.misses.join(", ") || "—"} | ${r.asr.replace(/\|/g, "\\|").slice(0, 60)} |`,
			),
			``,
			`> TTS（say）≠ 真人；用来回归链路与热词，不替代 T1 真人开口。`,
			``,
		].join("\n"),
	);

	console.log(`---- 汇总 ${pass}/${rows.length} (${(ratio * 100).toFixed(0)}%) ----`);
	console.log(`报告: ${reportPath}`);
	console.log(`门槛: ≥${(PASS_RATIO * 100).toFixed(0)}%`);

	if (ratio + 1e-9 < PASS_RATIO) {
		console.error(`FAILED: 命中率 ${(ratio * 100).toFixed(0)}% < ${(PASS_RATIO * 100).toFixed(0)}%`);
		process.exit(1);
	}
	console.log("PASSED");
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
