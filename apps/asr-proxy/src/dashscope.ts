/**
 * DashScope ASR Realtime WebSocket upstream client.
 */
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import WebSocket from "ws";

const DASHSCOPE_WS_URL =
	process.env.DASHSCOPE_WS_URL ?? "wss://dashscope.aliyuncs.com/api-ws/v1/inference";

export interface DashscopeAsrOpts {
	apiKey: string;
	model?: string;
	sampleRate?: number;
	format?: "pcm" | "wav" | "opus";
	languageHints?: string[];
	hotWords?: string[];
	disfluencyRemoval?: boolean;
	semanticPunctuation?: boolean;
}

export interface AsrSentence {
	text: string;
	beginMs?: number;
	endMs?: number | null;
	final: boolean;
}

export class DashscopeAsrClient extends EventEmitter {
	private ws: WebSocket;
	private taskId = randomUUID().replace(/-/g, "");
	private started = false;
	private closed = false;
	private finalSegments: string[] = [];

	constructor(private opts: DashscopeAsrOpts) {
		super();
		this.ws = new WebSocket(DASHSCOPE_WS_URL, {
			headers: {
				Authorization: `bearer ${opts.apiKey}`,
				"X-DashScope-DataInspection": "enable",
			},
			perMessageDeflate: false,
		});
		this.ws.on("open", () => this.sendRunTask());
		this.ws.on("message", (data, isBinary) => this.onUpstream(data, isBinary));
		this.ws.on("close", (code, reason) => {
			this.closed = true;
			this.emit("closed", { code, reason: reason.toString() });
		});
		this.ws.on("error", (err) => this.emit("error", err));
	}

	get isReady() {
		return this.started && !this.closed;
	}

	get fullText() {
		return this.finalSegments.join("");
	}

	private sendRunTask() {
		const cmd = {
			header: {
				action: "run-task",
				task_id: this.taskId,
				streaming: "duplex",
			},
			payload: {
				task_group: "audio",
				task: "asr",
				function: "recognition",
				model: this.opts.model ?? "fun-asr-realtime",
				parameters: {
					format: this.opts.format ?? "pcm",
					sample_rate: this.opts.sampleRate ?? 16000,
					disfluency_removal_enabled: this.opts.disfluencyRemoval ?? false,
					semantic_punctuation_enabled: this.opts.semanticPunctuation ?? true,
					...(this.opts.languageHints?.length
						? { language_hints: this.opts.languageHints }
						: {}),
					...(this.opts.hotWords?.length ? { hot_words: this.opts.hotWords } : {}),
				},
				input: {},
			},
		};
		this.ws.send(JSON.stringify(cmd));
	}

	private onUpstream(data: WebSocket.RawData, isBinary: boolean) {
		if (isBinary) return;
		let msg: Record<string, unknown>;
		try {
			msg = JSON.parse(data.toString()) as Record<string, unknown>;
		} catch {
			return;
		}
		const header = msg.header as { event?: string; error_message?: string } | undefined;
		const event = header?.event;
		switch (event) {
			case "task-started":
				this.started = true;
				this.emit("started");
				break;
			case "result-generated": {
				const output = (msg.payload as { output?: { sentence?: Record<string, unknown> } })
					?.output;
				const sentence = output?.sentence;
				if (!sentence) return;
				const text = String(sentence.text ?? "");
				const sentenceEnd = Boolean(sentence.sentence_end);
				if (sentenceEnd) {
					this.finalSegments.push(text);
					this.emit("final", {
						text,
						beginMs: sentence.begin_time as number | undefined,
						endMs: sentence.end_time as number | null | undefined,
						final: true,
					} as AsrSentence);
					this.emit("partial", { text: this.fullText, final: false } as AsrSentence);
				} else {
					const composed = this.finalSegments.join("") + text;
					this.emit("partial", { text: composed, final: false } as AsrSentence);
				}
				break;
			}
			case "task-finished":
				this.emit("done", { fullText: this.fullText });
				this.safeClose();
				break;
			case "task-failed":
				this.emit("error", new Error(header?.error_message ?? "task-failed"));
				this.safeClose();
				break;
		}
	}

	sendAudio(chunk: Buffer | Uint8Array) {
		if (!this.isReady) return;
		this.ws.send(chunk, { binary: true });
	}

	finish() {
		if (this.closed) return;
		const cmd = {
			header: {
				action: "finish-task",
				task_id: this.taskId,
				streaming: "duplex",
			},
			payload: { input: {} },
		};
		try {
			this.ws.send(JSON.stringify(cmd));
		} catch {
			/* ignore */
		}
	}

	abort() {
		this.safeClose();
	}

	private safeClose() {
		if (this.closed) return;
		this.closed = true;
		try {
			this.ws.close();
		} catch {
			/* ignore */
		}
	}
}
