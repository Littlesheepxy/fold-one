/**
 * ASR session: browser WebSocket <-> DashScope (no DB persist).
 */
import type { WebSocket as WsServer } from "ws";
import { DashscopeAsrClient } from "./dashscope.js";
import { OmniRealtimeClient, type OmniVoiceMode } from "./omni-realtime.js";

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
}

export function attachAsrSession(ws: WsServer, deps: SessionDeps) {
	let upstream: DashscopeAsrClient | OmniRealtimeClient | null = null;
	let upstreamSendable = false;
	const audioQueue: Buffer[] = [];

	const send = (obj: unknown) => {
		try {
			ws.send(JSON.stringify(obj));
		} catch {
			/* socket closed */
		}
	};

	ws.on("message", (data, isBinary) => {
		if (isBinary) {
			if (!upstream) return;
			if (upstreamSendable) {
				upstream.sendAudio(data as Buffer);
			} else {
				audioQueue.push(data as Buffer);
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

			const model = msg.model ?? deps.defaultModel;
			if (
				model !== deps.defaultModel &&
				model !== "qwen3.5-omni-plus-realtime"
			) {
				return send({ type: "error", message: "model not allowed" });
			}
			console.log(`[asr-proxy] session model=${model}, mode=${msg.mode ?? "structure"}`);
			upstream = model.includes("omni")
				? new OmniRealtimeClient({
						apiKey: deps.apiKey,
						model,
						mode: msg.mode ?? "structure",
						app: msg.app,
						windowTitle: msg.windowTitle,
					})
				: new DashscopeAsrClient({
						apiKey: deps.apiKey,
						model,
						sampleRate: msg.sampleRate ?? 16000,
						format: msg.format ?? "pcm",
						languageHints: msg.languageHints,
						hotWords: msg.hotWords,
					});

			upstream.on("started", () => {
				upstreamSendable = true;
				send({ type: "ready" });
				while (audioQueue.length) upstream!.sendAudio(audioQueue.shift()!);
			});
			upstream.on("partial", (s: { text: string }) => send({ type: "partial", text: s.text }));
			upstream.on("final", (s: { text: string }) => send({ type: "final", text: s.text }));
			upstream.on("done", ({ fullText, directStructured }: {
				fullText: string;
				directStructured?: boolean;
			}) => {
				send({ type: "done", fullText: fullText.trim(), directStructured: !!directStructured });
				try {
					ws.close();
				} catch {
					/* ignore */
				}
			});
			upstream.on("error", (err: Error) => send({ type: "error", message: err.message }));
			upstream.on("closed", () => {
				try {
					ws.close();
				} catch {
					/* ignore */
				}
			});
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
