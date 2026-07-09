import { useEffect, useRef } from "react";
import { createAliyunAsr, createMockAsr, type AsrController } from "@fold/voice";

const WS_BASE = import.meta.env.VITE_ASR_WS_URL ?? "ws://localhost:3003";

export function useVoiceHandlers() {
	const asrRef = useRef<AsrController | null>(null);
	const useMockRef = useRef(true);
	const wsBaseRef = useRef(WS_BASE);
	const voiceModeRef = useRef<"structure" | "reply" | "agent">("structure");

	useEffect(() => {
		void (async () => {
			const config = await window.fold.getConfig();
			useMockRef.current = await window.fold.getUseMockAsr();
			if (config.asrWsUrl) wsBaseRef.current = config.asrWsUrl;
		})();

		const startRecording = async () => {
			if (asrRef.current) return;
			const asr = useMockRef.current
				? createMockAsr()
				: createAliyunAsr({
						wsBaseUrl: wsBaseRef.current,
						workletPath: "/asr-pcm-worklet.js",
					});
			asrRef.current = asr;
			asr.onLevel?.((level) => {
				window.dispatchEvent(new CustomEvent("fold:voice-level-local", { detail: level }));
			});
			try {
				await asr.start({
					// 界面用音波，不再推实时字幕；ASR 仍在后台出最终文本
					onPartial: () => {},
					onError: (err) => {
						asrRef.current = null;
						void window.fold.voiceError(err.message);
					},
				});
			} catch (err) {
				asr.cancel();
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
