import { pcm16AudioLevel } from "./audio-level.js";
import type { VoiceAdapter, VoiceConfig, VoiceResult } from "./types.js";

const ASR_FINISH_BASE_MS = 15_000;
const ASR_FINISH_PER_AUDIO_SEC_MS = 800;
const ASR_FINISH_MAX_MS = 120_000;
/** 16kHz mono PCM16 ≈ 32KB/s；5 分钟硬顶，超出报错而不是丢最旧 */
const PRE_BUFFER_HARD_MAX_BYTES = 32_000 * 60 * 5;

export function openMicStream(): Promise<MediaStream> {
	return navigator.mediaDevices.getUserMedia({
		audio: {
			channelCount: 1,
			echoCancellation: true,
			noiseSuppression: true,
			autoGainControl: true,
		},
	});
}

function copyPcm(buf: ArrayBufferLike): ArrayBuffer {
	const src = new Uint8Array(buf);
	const out = new ArrayBuffer(src.byteLength);
	new Uint8Array(out).set(src);
	return out;
}

export interface AsrController extends VoiceAdapter {
	done: Promise<VoiceResult>;
}

/**
 * 铁律：已采集的用户语音不得静默丢弃。
 * - ready 前全部进本地缓冲；超硬顶 → 显式报错（不分段丢最旧）
 * - finish 超时 / 断线 → incomplete，由 UI 提示重说，禁止当作成功插入
 */
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
	let sessionReady = false;
	let finishRequested = false;
	let preBufferBytes = 0;
	let capturedAudioBytes = 0;
	const preBuffer: ArrayBuffer[] = [];
	/** ready 后若 socket 背压过大，暂存再送，避免浏览器丢帧 */
	const sendQueue: ArrayBuffer[] = [];
	let drainScheduled = false;

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

	const enqueueOrSend = (chunk: ArrayBuffer) => {
		capturedAudioBytes += chunk.byteLength;
		if (!sessionReady || ws?.readyState !== WebSocket.OPEN) {
			preBuffer.push(chunk);
			preBufferBytes += chunk.byteLength;
			if (preBufferBytes > PRE_BUFFER_HARD_MAX_BYTES) {
				fail(
					new Error(
						"这段话太长，识别会话还没建好。请分段再说，或检查网络后重试——已采集的音频不会被悄悄丢掉。",
					),
				);
			}
			return;
		}
		// 背压：超过 ~1s 未发出的量就排队，避免同步塞爆
		if (ws.bufferedAmount > 64_000 || sendQueue.length > 0) {
			sendQueue.push(chunk);
			scheduleDrain();
			return;
		}
		ws.send(chunk);
	};

	const scheduleDrain = () => {
		if (drainScheduled) return;
		drainScheduled = true;
		const tick = () => {
			drainScheduled = false;
			while (
				sendQueue.length > 0 &&
				ws?.readyState === WebSocket.OPEN &&
				ws.bufferedAmount < 64_000
			) {
				ws.send(sendQueue.shift()!);
			}
			if (sendQueue.length > 0 && ws?.readyState === WebSocket.OPEN) {
				drainScheduled = true;
				setTimeout(tick, 16);
			}
		};
		setTimeout(tick, 0);
	};

	const flushPreBuffer = () => {
		if (ws?.readyState !== WebSocket.OPEN) return;
		for (const chunk of preBuffer) {
			if (ws.bufferedAmount > 64_000) {
				sendQueue.push(chunk);
			} else {
				ws.send(chunk);
			}
		}
		preBuffer.length = 0;
		preBufferBytes = 0;
		if (sendQueue.length) scheduleDrain();
	};

	const sendFinishWhenDrained = () => {
		if (!finishRequested || ws?.readyState !== WebSocket.OPEN) return;
		const startedAt = Date.now();
		const trySend = () => {
			if (resolved || aborted) return;
			flushPreBuffer();
			scheduleDrain();
			// 只等我们自己的预缓冲/发送队列；bufferedAmount 不阻塞 finish（已在浏览器发送队列）
			if ((preBuffer.length > 0 || sendQueue.length > 0) && Date.now() - startedAt < 2000) {
				setTimeout(trySend, 30);
				return;
			}
			try {
				ws?.send(JSON.stringify({ type: "finish" }));
			} catch {
				/* ignore */
			}
		};
		trySend();
	};

	const hookWorklet = () => {
		if (aborted || resolved || !audioCtx || !mediaStream || workletNode) return;
		workletNode = new AudioWorkletNode(audioCtx, "pcm-worklet");
		workletNode.port.onmessage = (e: MessageEvent<Int16Array>) => {
			if (aborted || resolved) return;
			const buf = e.data;
			if (levelCb) levelCb(pcm16AudioLevel(new Uint8Array(buf.buffer)));
			// worklet 已 transfer 所有权；再 copy 一份入队，避免后续引用踩空
			enqueueOrSend(copyPcm(buf.buffer));
		};
		sourceNode = audioCtx.createMediaStreamSource(mediaStream);
		sourceNode.connect(workletNode);
	};

	const finishTimeoutMs = () => {
		const audioSec = capturedAudioBytes / 32_000;
		return Math.min(
			ASR_FINISH_MAX_MS,
			Math.max(ASR_FINISH_BASE_MS, Math.ceil(audioSec * ASR_FINISH_PER_AUDIO_SEC_MS) + ASR_FINISH_BASE_MS),
		);
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
		sessionReady = false;
		finishRequested = false;
		capturedAudioBytes = 0;
		preBufferBytes = 0;
		preBuffer.length = 0;
		sendQueue.length = 0;

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
					authToken: config.authToken,
					hotWords: config.hotWords?.length ? config.hotWords : undefined,
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
					sessionReady = true;
					flushPreBuffer();
					if (finishRequested) sendFinishWhenDrained();
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
			if (resolved) return;
			// finish 之后 proxy 会主动 close，这是常态。
			// 绝不能在这里抢先 finalize(incomplete)，否则会盖掉随后到达的 done。
			// 收尾交给 done 消息；若 done 丢失，由 stop() 的超时路径标 incomplete。
			if (finishRequested) return;
			if (lastFullText.trim()) {
				finalize({ text: lastFullText, directStructured, incomplete: true });
				return;
			}
			fail(new Error("识别连接已断开，请重说一遍。"));
		};

		audioCtx = new (window.AudioContext ||
			(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)({
			sampleRate: 16000,
		});
		const workletLoaded = audioCtx.audioWorklet.addModule(workletPath);
		mediaStream = config.warmStream
			? await config.warmStream.catch(() => openMicStream())
			: await openMicStream();
		// await 期间 ws 可能已失败并 cleanup 过：此时 ctx 已关闭，
		// 继续 hookWorklet 会在关闭的 ctx 上构造节点抛错，且刚开的麦克风流会泄漏
		if (resolved || aborted) {
			cleanup();
			return;
		}
		await workletLoaded;
		if (resolved || aborted) {
			cleanup();
			return;
		}
		hookWorklet();
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
			finishRequested = true;
			// 先断采集入口，排空 worklet 队列后再 finish，避免尾音丢失
			try {
				sourceNode?.disconnect();
			} catch {
				/* ignore */
			}
			await new Promise((r) => setTimeout(r, 80));
			if (sessionReady) sendFinishWhenDrained();
			const timeoutMs = finishTimeoutMs();
			let timeoutId: ReturnType<typeof setTimeout> | undefined;
			const timeout = new Promise<VoiceResult>((_, reject) => {
				timeoutId = setTimeout(
					() => reject(new Error("ASR finish timeout")),
					timeoutMs,
				);
			});
			try {
				return await Promise.race([done, timeout]);
			} catch {
				cleanup();
				// 绝不当作完整成功：有部分文本也标 incomplete，由 UI 拦截插入
				return {
					text: lastFullText,
					directStructured,
					incomplete: true,
				};
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
