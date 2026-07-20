/**
 * ASR session: browser WebSocket <-> DashScope (no local DB).
 */
import { randomUUID } from "node:crypto";
import type { WebSocket as WsServer } from "ws";
import { DashscopeAsrClient } from "./dashscope.js";
import { fetchEntitlements, mustAuthenticate, reportVoiceUsage } from "./entitlements.js";
import { OmniRealtimeClient, type OmniVoiceMode } from "./omni-realtime.js";
import { ensureVocabularyId, buildAsrContextText } from "./vocabulary.js";

interface StartMsg {
	type: "start";
	sessionId?: string;
	sampleRate?: number;
	format?: "pcm" | "wav" | "opus";
	languageHints?: string[];
	hotWords?: string[];
	model?: string;
	mode?: OmniVoiceMode;
	app?: string | null;
	windowTitle?: string | null;
	authToken?: string;
}

interface FinishMsg {
	type: "finish";
}
interface AbortMsg {
	type: "abort";
}
type ClientMsg = StartMsg | FinishMsg | AbortMsg;

export interface SessionDeps {
	apiKey: string;
	defaultModel: string;
	upgradeToken?: string | null;
}

const ALLOWED_MODELS = new Set([
	"fun-asr-realtime",
	"qwen3.5-omni-flash-realtime",
	"qwen3.5-omni-plus-realtime",
]);

/**
 * Cost-aware route:
 * - reply/agent → Omni Plus
 * - structure + 热词 → Fun-ASR（引擎 vocabulary_id bias）
 * - structure 无热词 → Omni Flash（端到端整理）
 */
export function resolveSessionModel(
	mode: OmniVoiceMode | undefined,
	requested: string | undefined,
	defaultModel: string,
	hotWords?: string[],
): string {
	const voiceMode = mode ?? "structure";
	if (voiceMode === "reply" || voiceMode === "agent") {
		return "qwen3.5-omni-plus-realtime";
	}
	if (voiceMode === "structure" && (hotWords?.length ?? 0) > 0) {
		return "fun-asr-realtime";
	}
	if (requested && ALLOWED_MODELS.has(requested)) {
		if (requested.includes("omni-plus")) {
			return "qwen3.5-omni-flash-realtime";
		}
		return requested;
	}
	if (defaultModel.includes("omni-plus")) {
		return "qwen3.5-omni-flash-realtime";
	}
	if (ALLOWED_MODELS.has(defaultModel)) return defaultModel;
	return "qwen3.5-omni-flash-realtime";
}

export function attachAsrSession(ws: WsServer, deps: SessionDeps) {
	let upstream: DashscopeAsrClient | OmniRealtimeClient | null = null;
	let upstreamSendable = false;
	const audioQueue: Buffer[] = [];
	let audioBytes = 0;
	let sampleRate = 16000;
	let foldToken: string | null = deps.upgradeToken ?? null;
	let sessionModel = deps.defaultModel;
	let sessionMode: OmniVoiceMode = "structure";
	let requestId = randomUUID() as string;
	let usageReported = false;

	const send = (obj: unknown) => {
		try {
			ws.send(JSON.stringify(obj));
		} catch {
			/* socket closed */
		}
	};

	const reportUsageOnce = async () => {
		if (usageReported || !foldToken || audioBytes <= 0) return;
		usageReported = true;
		const audioSeconds = audioBytes / 2 / sampleRate;
		await reportVoiceUsage({
			apiKey: foldToken,
			requestId,
			audioSeconds,
			mode: sessionMode,
			model: sessionModel,
		});
	};

	ws.on("message", (data, isBinary) => {
		if (isBinary) {
			const buf = data as Buffer;
			audioBytes += buf.byteLength;
			if (upstreamSendable && upstream) {
				upstream.sendAudio(buf);
			} else {
				audioQueue.push(buf);
			}
			return;
		}

		let msg: ClientMsg;
		try {
			msg = JSON.parse(data.toString()) as ClientMsg;
		} catch {
			return send({ type: "error", message: "bad json" });
		}

		if (msg.type === "start") {
			if (upstream) return send({ type: "error", message: "already started" });

			void (async () => {
				try {
					foldToken = msg.authToken?.trim() || foldToken;
					if (mustAuthenticate(foldToken)) {
						if (!foldToken?.startsWith("tm_")) {
							return send({ type: "error", message: "auth required" });
						}
						const entitlements = await fetchEntitlements(foldToken);
						if (entitlements.voiceSecondsRemaining <= 0) {
							return send({ type: "error", message: "voice_quota_exceeded" });
						}
					}

					sessionMode = msg.mode ?? "structure";
					const hotWords = (msg.hotWords ?? [])
						.map((w) => String(w).trim())
						.filter(Boolean)
						.slice(0, 100);
					sessionModel = resolveSessionModel(
						sessionMode,
						msg.model,
						deps.defaultModel,
						hotWords,
					);
					sampleRate = msg.sampleRate ?? 16000;
					requestId = (msg.sessionId?.trim() || randomUUID()) as string;
					audioBytes = 0;
					usageReported = false;

					console.log(
						`[asr-proxy] session model=${sessionModel}, mode=${sessionMode}, hotWords=${hotWords.length}, auth=${foldToken ? "yes" : "no"}`,
					);

					if (sessionModel.includes("omni")) {
						upstream = new OmniRealtimeClient({
							apiKey: deps.apiKey,
							model: sessionModel,
							mode: sessionMode,
							app: msg.app,
							windowTitle: msg.windowTitle,
							hotWords,
						});
					} else {
						const vocabularyId =
							hotWords.length > 0
								? await ensureVocabularyId(deps.apiKey, hotWords)
								: null;
						upstream = new DashscopeAsrClient({
							apiKey: deps.apiKey,
							model: sessionModel,
							sampleRate,
							format: msg.format ?? "pcm",
							languageHints: msg.languageHints,
							vocabularyId,
							contextText: hotWords.length ? buildAsrContextText(hotWords) : null,
						});
					}

					upstream.on("started", () => {
						upstreamSendable = true;
						send({ type: "ready", model: sessionModel });
						while (audioQueue.length) upstream!.sendAudio(audioQueue.shift()!);
					});
					upstream.on("partial", (s: { text: string }) => send({ type: "partial", text: s.text }));
					upstream.on("final", (s: { text: string }) => send({ type: "final", text: s.text }));
					upstream.on("done", ({ fullText, directStructured }: {
						fullText: string;
						directStructured?: boolean;
					}) => {
						send({
							type: "done",
							fullText: fullText.trim(),
							directStructured: !!directStructured,
							model: sessionModel,
						});
						try {
							ws.close();
						} catch {
							/* ignore */
						}
						void reportUsageOnce();
					});
					upstream.on("error", (err: Error) => send({ type: "error", message: err.message }));
					upstream.on("closed", () => {
						try {
							ws.close();
						} catch {
							/* ignore */
						}
					});
				} catch (error) {
					send({
						type: "error",
						message: error instanceof Error ? error.message : "session start failed",
					});
				}
			})();
			return;
		}

		if (msg.type === "finish") {
			upstream?.finish();
			return;
		}
		if (msg.type === "abort") {
			upstream?.abort();
			try {
				ws.close();
			} catch {
				/* ignore */
			}
		}
	});

	ws.on("close", () => upstream?.abort());
	ws.on("error", () => upstream?.abort());
}
