import { pcm16AudioLevel } from "./audio-level.js";
import type { VoiceAdapter, VoiceConfig } from "./types.js";

export interface AsrController extends VoiceAdapter {
	done: Promise<{ fullText: string }>;
}

export function createAliyunAsr(config: VoiceConfig = {}): AsrController {
	const wsBase =
		config.wsBaseUrl ??
		(typeof location !== "undefined"
			? `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.hostname}:3003`
			: "ws://localhost:3003");
	const workletPath = config.workletPath ?? "/asr-pcm-worklet.js";

	let ws: WebSocket | null = null;
	let audioCtx: AudioContext | null = null;
	let mediaStream: MediaStream | null = null;
	let workletNode: AudioWorkletNode | null = null;
	let sourceNode: MediaStreamAudioSourceNode | null = null;
	let aborted = false;
	let resolved = false;
	let lastFullText = "";
	let levelCb: ((level: number) => void) | null = null;
	let onPartialCb: ((text: string) => void) | null = null;
	let onErrorCb: ((err: Error) => void) | null = null;

	let resolveDone!: (r: { fullText: string }) => void;
	let rejectDone!: (e: Error) => void;
	const done = new Promise<{ fullText: string }>((res, rej) => {
		resolveDone = res;
		rejectDone = rej;
	});

	const cleanup = () => {
		try {
			workletNode?.disconnect();
		} catch {
			/* ignore */
		}
		try {
			sourceNode?.disconnect();
		} catch {
			/* ignore */
		}
		for (const t of mediaStream?.getTracks() ?? []) t.stop();
		try {
			audioCtx?.close();
		} catch {
			/* ignore */
		}
		try {
			ws?.close();
		} catch {
			/* ignore */
		}
	};

	const finalize = (r: { fullText: string }) => {
		if (resolved) return;
		resolved = true;
		cleanup();
		resolveDone(r);
	};

	const fail = (e: Error) => {
		if (resolved) return;
		resolved = true;
		cleanup();
		onErrorCb?.(e);
		rejectDone(e);
	};

	const hookWorklet = () => {
		if (aborted || !audioCtx || !mediaStream) return;
		workletNode = new AudioWorkletNode(audioCtx, "pcm-worklet");
		workletNode.port.onmessage = (e: MessageEvent<Int16Array>) => {
			if (aborted || ws?.readyState !== WebSocket.OPEN) return;
			const buf = e.data;
			if (levelCb) levelCb(pcm16AudioLevel(new Uint8Array(buf.buffer)));
			ws.send(buf.buffer);
		};
		sourceNode = audioCtx.createMediaStreamSource(mediaStream);
		sourceNode.connect(workletNode);
	};

	const startSession = async (opts: {
		onPartial: (text: string) => void;
		onError?: (err: Error) => void;
	}) => {
		if (ws) throw new Error("ASR already started");
		onPartialCb = opts.onPartial;
		onErrorCb = opts.onError ?? null;
		aborted = false;
		resolved = false;
		lastFullText = "";

		mediaStream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1,
				echoCancellation: true,
				noiseSuppression: true,
				autoGainControl: true,
			},
		});

		audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
			sampleRate: 16000,
		});
		await audioCtx.audioWorklet.addModule(workletPath);

		ws = new WebSocket(`${wsBase}/asr/stream`);
		ws.binaryType = "arraybuffer";

		ws.onopen = () => {
			ws!.send(
				JSON.stringify({
					type: "start",
					sampleRate: 16000,
					format: "pcm",
					languageHints: config.languageHints ?? ["zh", "en"],
					model: config.model,
				}),
			);
		};

		ws.onmessage = (ev) => {
			if (typeof ev.data !== "string") return;
			let msg: { type: string; text?: string; fullText?: string; message?: string };
			try {
				msg = JSON.parse(ev.data) as typeof msg;
			} catch {
				return;
			}
			switch (msg.type) {
				case "ready":
					hookWorklet();
					break;
				case "partial":
					lastFullText = msg.text ?? "";
					onPartialCb?.(lastFullText);
					break;
				case "done":
					lastFullText = msg.fullText ?? lastFullText;
					finalize({ fullText: lastFullText });
					break;
				case "error":
					fail(new Error(msg.message ?? "ASR error"));
					break;
			}
		};

		ws.onerror = () => fail(new Error("ASR WebSocket error"));
		ws.onclose = () => {
			if (!resolved) finalize({ fullText: lastFullText });
		};
	};

	return {
		async start(opts) {
			await startSession(opts);
		},
		cancel() {
			aborted = true;
			try {
				ws?.send(JSON.stringify({ type: "abort" }));
			} catch {
				/* ignore */
			}
			finalize({ fullText: "" });
		},
		async stop() {
			if (ws?.readyState === WebSocket.OPEN) {
				try {
					ws.send(JSON.stringify({ type: "finish" }));
				} catch {
					/* ignore */
				}
			}
			const timeout = new Promise<{ fullText: string }>((_, rej) =>
				setTimeout(() => rej(new Error("ASR finish timeout")), 8000),
			);
			try {
				const r = await Promise.race([done, timeout]);
				return r.fullText;
			} catch {
				return lastFullText;
			}
		},
		onLevel(cb) {
			levelCb = cb;
		},
		done,
	};
}

/** Mock ASR for dev without DASHSCOPE_API_KEY */
export function createMockAsr(): AsrController {
	let partial = "";
	let timer: ReturnType<typeof setInterval> | null = null;
	const sample = "帮我整理刚下载的报价发给 Jason";
	let onPartial: ((t: string) => void) | null = null;

	return {
		async start(opts) {
			onPartial = opts.onPartial;
			let i = 0;
			partial = "";
			timer = setInterval(() => {
				if (i < sample.length) {
					partial += sample[i++];
					onPartial?.(partial);
				}
			}, 120);
		},
		cancel() {
			if (timer) clearInterval(timer);
			partial = "";
		},
		async stop() {
			if (timer) clearInterval(timer);
			return sample;
		},
		onLevel(cb) {
			const t = setInterval(() => cb(Math.random() * 0.5 + 0.2), 95);
			setTimeout(() => clearInterval(t), 5000);
		},
		done: Promise.resolve({ fullText: sample }),
	};
}
