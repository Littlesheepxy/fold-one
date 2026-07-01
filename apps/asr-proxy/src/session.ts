/**
 * ASR session: browser WebSocket <-> DashScope (no DB persist).
 */
import type { WebSocket as WsServer } from "ws";
import { DashscopeAsrClient } from "./dashscope.js";

interface StartMsg {
	type: "start";
	sessionId?: string;
	sampleRate?: number;
	format?: "pcm" | "wav" | "opus";
	languageHints?: string[];
	hotWords?: string[];
	model?: string;
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
	let upstream: DashscopeAsrClient | null = null;
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

			upstream = new DashscopeAsrClient({
				apiKey: deps.apiKey,
				model: msg.model ?? deps.defaultModel,
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
			upstream.on("done", ({ fullText }: { fullText: string }) => {
				send({ type: "done", fullText: fullText.trim() });
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
