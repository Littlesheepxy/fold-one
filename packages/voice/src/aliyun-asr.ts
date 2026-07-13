import { pcm16AudioLevel } from "./audio-level.js";
import type { VoiceAdapter, VoiceConfig, VoiceResult } from "./types.js";

const ASR_FINISH_TIMEOUT_MS = 10_000;

export interface AsrController extends VoiceAdapter {
	done: Promise<VoiceResult>;
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
	let directStructured = false;
	let levelCb: ((level: number) => void) | null = null;
	let onPartialCb: ((text: string) => void) | null = null;
	let onErrorCb: ((err: Error) => void) | null = null;

	let resolveDone!: (r: VoiceResult) => void;
	let rejectDone!: (e: Error) => void;
	const done = new Promise<VoiceResult>((res, rej) => {
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

	const finalize = (result: VoiceResult) => {
		if (resolved) return;
		resolved = true;
		cleanup();
		resolveDone(result);
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
		directStructured = false;

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
					mode: config.mode,
					app: config.app,
					windowTitle: config.windowTitle,
				}),
			);
		};

		ws.onmessage = (ev) => {
			if (typeof ev.data !== "string") return;
			let msg: {
				type: string;
				text?: string;
				fullText?: string;
				directStructured?: boolean;
				message?: string;
			};
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
					directStructured = !!msg.directStructured;
					finalize({ text: lastFullText, directStructured });
					break;
				case "error":
					fail(new Error(msg.message ?? "ASR error"));
					break;
			}
		};

		ws.onerror = () => fail(new Error("ASR WebSocket error"));
		ws.onclose = () => {
			if (!resolved) finalize({ text: lastFullText, directStructured });
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
			finalize({ text: "", directStructured: false });
		},
		async stop() {
			if (ws?.readyState === WebSocket.OPEN) {
				try {
					ws.send(JSON.stringify({ type: "finish" }));
				} catch {
					/* ignore */
				}
			}
			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			const timeout = new Promise<VoiceResult>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error("ASR finish timeout")),
					ASR_FINISH_TIMEOUT_MS,
				);
			});
			try {
				return await Promise.race([done, timeout]);
			} catch {
				try {
					ws?.send(JSON.stringify({ type: "abort" }));
				} catch {
					/* socket already closed */
				}
				cleanup();
				return { text: lastFullText, directStructured };
			} finally {
				if (timeoutId) clearTimeout(timeoutId);
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
	let levelTimer: ReturnType<typeof setInterval> | null = null;
	let typingIndex = 0;
	const sample = "帮我整理刚下载的报价发给 Jason";
	let onPartial: ((t: string) => void) | null = null;

	const clearTimers = () => {
		if (timer) clearInterval(timer);
		if (levelTimer) clearInterval(levelTimer);
		timer = null;
		levelTimer = null;
	};

	return {
		async start(opts) {
			onPartial = opts.onPartial;
			typingIndex = 0;
			partial = "";
			timer = setInterval(() => {
				if (typingIndex < sample.length) {
					partial += sample[typingIndex++];
					onPartial?.(partial);
				}
			}, 120);
		},
		cancel() {
			clearTimers();
			partial = "";
			typingIndex = 0;
		},
		async stop() {
			clearTimers();
			return { text: sample, directStructured: false };
		},
		onLevel(cb) {
			levelTimer = setInterval(() => cb(0), 80);
		},
		done: Promise.resolve({ text: sample, directStructured: false }),
	};
}
