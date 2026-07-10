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
		void audio.play().catch(() => {
			// Autoplay policy: blocked until user gesture.
		});
	} catch {
		// ignore
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

	if (next === "listening" && prev !== "listening") {
		playFoldSound("voiceStart");
		return;
	}

	// 松键结束录音：保留现有「嘚嘚」；净化/代回完成后不再另播结束音
	if (
		prev === "listening" &&
		(next === "understanding" || next === "planning" || next === "working")
	) {
		playFoldSound("startup");
		return;
	}

	// 净化/代回完成：内容直接出来，不再播 Agent 任务完成音
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

	if (next === "idle" && prev !== "idle" && prev !== "done") {
		playFoldSound("end");
		return;
	}

	if (prev === "idle" && next !== "idle" && next !== "listening") {
		playFoldSound("startup");
	}
}
