import { pcm16AudioLevel } from "./audio-level.js";
import type { AsrController } from "./aliyun-asr.js";
import type { VoiceConfig } from "./types.js";

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
	let resolveDone!: (result: { fullText: string }) => void;
	let rejectDone!: (error: Error) => void;
	const done = new Promise<{ fullText: string }>((resolve, reject) => {
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
				await config.transport.start();
				mediaStream = await navigator.mediaDevices.getUserMedia({
					audio: {
						channelCount: 1,
						echoCancellation: true,
						noiseSuppression: true,
						autoGainControl: true,
					},
				});
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
					config.transport.sendAudio(payload);
				};
				sourceNode = audioCtx.createMediaStreamSource(mediaStream);
				sourceNode.connect(workletNode);
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
			cleanup();
			try {
				const fullText = await config.transport.finish();
				resolveDone({ fullText });
				return fullText;
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
			resolveDone({ fullText: "" });
		},
		onLevel(cb) {
			levelCb = cb;
		},
		done,
	};
}
