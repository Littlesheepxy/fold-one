import { useEffect, useRef } from "react";
import {
	createAliyunAsr,
	createLocalAsr,
	createMockAsr,
	type AsrController,
} from "@fold/voice";

const WS_BASE = import.meta.env.VITE_ASR_WS_URL ?? "ws://localhost:3003";

export function useVoiceHandlers() {
	const asrRef = useRef<AsrController | null>(null);
	const wsBaseRef = useRef(WS_BASE);
	const voiceModeRef = useRef<"structure" | "reply" | "agent">("structure");

	useEffect(() => {
		void (async () => {
			const config = await window.fold.getConfig();
			if (config.asrWsUrl) wsBaseRef.current = config.asrWsUrl;
		})();

		const startRecording = async () => {
			if (asrRef.current) return;
			try {
				const runtime = await window.fold.getAsrRuntime();
				if (runtime.provider === "local-whisper" && !runtime.ready) {
					throw new Error("请先在设置中下载语音包，才能使用本地语音识别。");
				}
				const asr =
					runtime.provider === "local-whisper"
						? createLocalAsr({
								workletPath: "/asr-pcm-worklet.js",
								transport: {
									start: async () => {
										await window.fold.localAsrStart();
									},
									sendAudio: (chunk) => window.fold.localAsrAudio(chunk),
									finish: () => window.fold.localAsrFinish(),
									cancel: async () => {
										await window.fold.localAsrCancel();
									},
								},
							})
						: runtime.provider === "dashscope"
							? createAliyunAsr({
									wsBaseUrl: wsBaseRef.current,
									workletPath: "/asr-pcm-worklet.js",
								})
							: createMockAsr();
				asrRef.current = asr;
				asr.onLevel?.((level) => {
					window.dispatchEvent(new CustomEvent("fold:voice-level-local", { detail: level }));
				});
				await asr.start({
					// 界面用音波，不再推实时字幕；ASR 仍在后台出最终文本
					onPartial: () => {},
					onError: (err) => {
						asrRef.current = null;
						void window.fold.voiceError(err.message);
					},
				});
			} catch (err) {
				asrRef.current?.cancel();
				asrRef.current = null;
				void window.fold.voiceError((err as Error).message);
			}
		};

		const cancelRecording = () => {
			asrRef.current?.cancel();
			asrRef.current = null;
		};

		const stopRecording = async (mode: "structure" | "reply" | "agent") => {
			const asr = asrRef.current;
			if (!asr) {
				await window.fold.dismiss();
				return;
			}
			try {
				const text = await asr.stop();
				asrRef.current = null;
				if (text.trim()) {
					if (mode === "agent") await window.fold.runTask(text);
					else if (mode === "reply") await window.fold.replyVoice(text);
					else await window.fold.structureVoice(text);
				} else {
					await window.fold.dismiss();
				}
			} catch (err) {
				asrRef.current = null;
				void window.fold.voiceError((err as Error).message);
			}
		};

		const unsubs = [
			window.fold.onHotkeyDown((mode) => {
				voiceModeRef.current = mode;
				void startRecording();
			}),
			window.fold.onHotkeyUp((mode) => void stopRecording(mode)),
			window.fold.onHotkeyCancel(cancelRecording),
		];

		return () => {
			for (const u of unsubs) u();
			asrRef.current?.cancel();
			asrRef.current = null;
		};
	}, []);
}
