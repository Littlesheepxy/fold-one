const SOUND_URLS = {
	startup: "/sounds/startup.mp3",
	voiceStart: "/sounds/voice-start.mp3",
	taskDone: "/sounds/task-done.mp3",
	predictEnd: "/sounds/predict-end.mp3",
	interrupt: "/sounds/interrupt-takeover.mp3",
	end: "/sounds/end.mp3",
} as const;

export type FoldSoundId = keyof typeof SOUND_URLS;

const cache = new Map<FoldSoundId, HTMLAudioElement>();
let lastPlayAt = 0;

function getAudio(id: FoldSoundId): HTMLAudioElement {
	let audio = cache.get(id);
	if (!audio) {
		audio = new Audio(SOUND_URLS[id]);
		audio.preload = "auto";
		cache.set(id, audio);
	}
	return audio;
}

export function preloadFoldSounds() {
	for (const id of Object.keys(SOUND_URLS) as FoldSoundId[]) {
		getAudio(id).load();
	}
}

export function playFoldSound(id: FoldSoundId) {
	try {
		const now = Date.now();
		if (now - lastPlayAt < 100) return;
		lastPlayAt = now;
		const audio = getAudio(id);
		audio.currentTime = 0;
		void audio.play().catch((error) => {
			console.warn(`[fold:sound] ${id} 播放失败`, error);
		});
	} catch (error) {
		console.warn(`[fold:sound] ${id} 初始化失败`, error);
	}
}

export type FoldVoiceMode = "structure" | "reply" | "agent" | null | undefined;

function isVoiceAssistMode(voiceMode: FoldVoiceMode): boolean {
	return voiceMode === "structure" || voiceMode === "reply";
}

/** 根据 overlay 状态切换播放对应音效。 */
export function playFoldSoundForStatus(
	prev: string,
	next: string,
	voiceMode?: FoldVoiceMode,
) {
	if (next === prev) return;

	// 录音开始/结束音由真实 hotkey down/up 触发，避免快速状态切换被 React 合并漏播。
	if (next === "done" && prev !== "done") {
		if (isVoiceAssistMode(voiceMode)) return;
		playFoldSound("taskDone");
		return;
	}

	if (next === "ask" && prev !== "ask") {
		playFoldSound("interrupt");
		return;
	}

	if (next === "idle" && prev === "predict") {
		playFoldSound("predictEnd");
		return;
	}

	if (
		next === "idle" &&
		prev !== "idle" &&
		prev !== "done" &&
		prev !== "formatting" &&
		prev !== "listening"
	) {
		playFoldSound("end");
		return;
	}

	if (prev === "idle" && next !== "idle" && next !== "listening") {
		playFoldSound("startup");
	}
}
