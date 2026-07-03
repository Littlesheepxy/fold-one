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

/** 根据 overlay 状态切换播放对应音效。 */
export function playFoldSoundForStatus(prev: string, next: string) {
	if (next === prev) return;

	if (next === "listening" && prev !== "listening") {
		playFoldSound("voiceStart");
		return;
	}

	if (
		prev === "listening" &&
		(next === "understanding" || next === "planning" || next === "working")
	) {
		playFoldSound("startup");
		return;
	}

	if (next === "done" && prev !== "done") {
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
