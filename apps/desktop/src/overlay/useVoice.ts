import { useEffect, useRef } from "react";
import {
	createAliyunAsr,
	createLocalAsr,
	createMockAsr,
	openMicStream,
	type AsrController,
} from "@fold/voice";
import { playFoldSound } from "./sounds";

const WS_BASE = import.meta.env.VITE_ASR_WS_URL ?? "ws://localhost:3003";
/** keydown 预热的麦克风流未被会话接管时的存活时间 */
const WARM_STREAM_TTL_MS = 5000;

export function useVoiceHandlers() {
	const asrRef = useRef<AsrController | null>(null);
	const wsBaseRef = useRef(WS_BASE);
	const voiceModeRef = useRef<"structure" | "reply" | "agent">("structure");
	const warmRef = useRef<{
		stream: Promise<MediaStream>;
		timer: ReturnType<typeof setTimeout>;
	} | null>(null);

	useEffect(() => {
		void (async () => {
			const config = await window.fold.getConfig();
			if (config.asrWsUrl) wsBaseRef.current = config.asrWsUrl;
		})();

		const dropWarmStream = () => {
			const warm = warmRef.current;
			if (!warm) return;
			warmRef.current = null;
			clearTimeout(warm.timer);
			warm.stream
				.then((stream) => {
					for (const track of stream.getTracks()) track.stop();
				})
				.catch(() => {});
		};

		/** 会话接管预热流；无预热时返回 undefined，adapter 自己开麦 */
		const takeWarmStream = () => {
			const warm = warmRef.current;
			if (!warm) return undefined;
			warmRef.current = null;
			clearTimeout(warm.timer);
			return warm.stream;
		};

		const warmMic = async () => {
			if (asrRef.current || warmRef.current) return;
			// 未授权时不预热，避免在错误时机弹权限框（正式开麦时再弹）
			try {
				const perm = await navigator.permissions.query({
					name: "microphone" as PermissionName,
				});
				if (perm.state !== "granted") return;
			} catch {
				return;
			}
			if (asrRef.current || warmRef.current) return;
			const stream = openMicStream();
			stream.catch(() => {});
			warmRef.current = {
				stream,
				timer: setTimeout(dropWarmStream, WARM_STREAM_TTL_MS),
			};
		};

		const startRecording = async (session: {
			mode: "structure" | "reply" | "agent";
			app?: string | null;
			windowTitle?: string | null;
		}) => {
			if (asrRef.current) return;
			try {
				const runtime = await window.fold.getAsrRuntime();
				if (runtime.provider === "local-whisper" && !runtime.ready) {
					throw new Error("请先在设置中下载语音包，才能使用本地语音识别。");
				}
				// mock 不吃 MediaStream，直接释放预热流防止麦克风悬挂
				if (runtime.provider !== "local-whisper" && runtime.provider !== "dashscope") {
					dropWarmStream();
				}
				const warmStream = takeWarmStream();
				const asr =
					runtime.provider === "local-whisper"
						? createLocalAsr({
								workletPath: "/asr-pcm-worklet.js",
								warmStream,
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
									warmStream,
									mode: session.mode,
									app: session.app,
									windowTitle: session.windowTitle,
									authToken: runtime.authToken,
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
				// start() resolve = 麦克风已在采集（预缓冲兜底），此刻提示音才是真实的"可以说了"
				playFoldSound("voiceStart");
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
				await window.fold.voiceEmpty();
				return;
			}
			try {
				const result = await asr.stop();
				asrRef.current = null;
				if (result.text.trim()) {
					if (mode === "agent") await window.fold.runTask(result.text);
					else if (mode === "reply") await window.fold.replyVoice(result.text);
					else {
						await window.fold.structureVoice(result.text, {
							directStructured: result.directStructured,
						});
					}
				} else {
					await window.fold.voiceEmpty();
				}
			} catch (err) {
				asrRef.current = null;
				void window.fold.voiceError((err as Error).message);
			}
		};

		const unsubs = [
			window.fold.onVoiceWarm(() => void warmMic()),
			window.fold.onHotkeyDown((session) => {
				voiceModeRef.current = session.mode;
				void startRecording(session);
			}),
			window.fold.onHotkeyUp((mode) => {
				playFoldSound("startup");
				void stopRecording(mode);
			}),
			window.fold.onHotkeyCancel(() => {
				dropWarmStream();
				cancelRecording();
			}),
		];

		return () => {
			for (const u of unsubs) u();
			dropWarmStream();
			asrRef.current?.cancel();
			asrRef.current = null;
		};
	}, []);
}
