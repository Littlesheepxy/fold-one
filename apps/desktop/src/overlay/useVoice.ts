import { useEffect, useRef } from "react";
import { createAliyunAsr, createMockAsr, type AsrController } from "@fold/voice";

const WS_BASE = import.meta.env.VITE_ASR_WS_URL ?? "ws://localhost:3003";

export function useVoiceHandlers() {
	const asrRef = useRef<AsrController | null>(null);
	const useMockRef = useRef(true);
	const wsBaseRef = useRef(WS_BASE);

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
			try {
				await asr.start({
					onPartial: (text) => {
						window.dispatchEvent(new CustomEvent("fold:transcript-local", { detail: text }));
					},
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

		const stopRecording = async () => {
			const asr = asrRef.current;
			if (!asr) {
				await window.fold.dismiss();
				return;
			}
			try {
				const text = await asr.stop();
				asrRef.current = null;
				if (text.trim()) {
					await window.fold.runTask(text);
				} else {
					await window.fold.dismiss();
				}
			} catch (err) {
				asrRef.current = null;
				void window.fold.voiceError((err as Error).message);
			}
		};

		const unsubs = [
			window.fold.onHotkeyDown(() => void startRecording()),
			window.fold.onHotkeyUp(() => void stopRecording()),
			window.fold.onHotkeyCancel(cancelRecording),
		];

		return () => {
			for (const u of unsubs) u();
			asrRef.current?.cancel();
			asrRef.current = null;
		};
	}, []);
}
