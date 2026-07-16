import { openMicStream, type AsrController } from "./aliyun-asr.js";
import { pcm16AudioLevel } from "./audio-level.js";
import type { VoiceConfig, VoiceResult } from "./types.js";

export interface LocalAsrTransport {
	start(): Promise<void>;
	sendAudio(chunk: ArrayBuffer): void;
	finish(): Promise<string>;
	cancel(): Promise<void> | void;
}

export function createLocalAsr(
	config: VoiceConfig & { transport: LocalAsrTransport },
): AsrController {
	const workletPath = config.workletPath ?? "/asr-pcm-worklet.js";
	let audioCtx: AudioContext | null = null;
	let mediaStream: MediaStream | null = null;
	let workletNode: AudioWorkletNode | null = null;
	let sourceNode: MediaStreamAudioSourceNode | null = null;
	let levelCb: ((level: number) => void) | null = null;
	let cancelled = false;
	let resolveDone!: (result: VoiceResult) => void;
	let rejectDone!: (error: Error) => void;
	const done = new Promise<VoiceResult>((resolve, reject) => {
		resolveDone = resolve;
		rejectDone = reject;
	});

	const cleanup = () => {
		workletNode?.disconnect();
		sourceNode?.disconnect();
		for (const track of mediaStream?.getTracks() ?? []) track.stop();
		void audioCtx?.close();
		workletNode = null;
		sourceNode = null;
		mediaStream = null;
		audioCtx = null;
	};

	return {
		async start(opts) {
			cancelled = false;
			try {
				// transport 启动与开麦并行；未就绪前缓冲，杜绝丢首音节
				let transportReady = false;
				const preBuffer: ArrayBuffer[] = [];
				const PRE_HARD = 32_000 * 60 * 5;
				let preBytes = 0;
				const transportStarted = config.transport.start().then(() => {
					transportReady = true;
					for (const chunk of preBuffer) config.transport.sendAudio(chunk);
					preBuffer.length = 0;
					preBytes = 0;
				});
				mediaStream = config.warmStream
					? await config.warmStream.catch(() => openMicStream())
					: await openMicStream();
				audioCtx = new (
					window.AudioContext ||
					(window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
				)({ sampleRate: 16000 });
				await audioCtx.audioWorklet.addModule(workletPath);
				workletNode = new AudioWorkletNode(audioCtx, "pcm-worklet");
				workletNode.port.onmessage = (event: MessageEvent<Int16Array>) => {
					if (cancelled) return;
					const chunk = event.data;
					levelCb?.(pcm16AudioLevel(new Uint8Array(chunk.buffer)));
					const payload = new ArrayBuffer(chunk.byteLength);
					new Int16Array(payload).set(chunk);
					if (transportReady) {
						config.transport.sendAudio(payload);
						return;
					}
					preBuffer.push(payload);
					preBytes += payload.byteLength;
					if (preBytes > PRE_HARD) {
						const reason = new Error(
							"这段话太长，本地识别还没就绪。请分段再说——已采集的音频不会被悄悄丢掉。",
						);
						cancelled = true;
						cleanup();
						opts.onError?.(reason);
						rejectDone(reason);
					}
				};
				sourceNode = audioCtx.createMediaStreamSource(mediaStream);
				sourceNode.connect(workletNode);
				await transportStarted;
				opts.onPartial("");
			} catch (error) {
				const reason = error instanceof Error ? error : new Error(String(error));
				cleanup();
				opts.onError?.(reason);
				rejectDone(reason);
				throw reason;
			}
		},
		async stop() {
			// 先断采集，排空 worklet 消息，再 finish——避免尾音在 cleanup 时被掐断
			try {
				sourceNode?.disconnect();
			} catch {
				/* ignore */
			}
			await new Promise((r) => setTimeout(r, 80));
			cleanup();
			try {
				const fullText = await config.transport.finish();
				const result = { text: fullText, directStructured: false };
				resolveDone(result);
				return result;
			} catch (error) {
				const reason = error instanceof Error ? error : new Error(String(error));
				rejectDone(reason);
				throw reason;
			}
		},
		cancel() {
			cancelled = true;
			cleanup();
			void config.transport.cancel();
			resolveDone({ text: "", directStructured: false });
		},
		onLevel(cb) {
			levelCb = cb;
		},
		done,
	};
}
