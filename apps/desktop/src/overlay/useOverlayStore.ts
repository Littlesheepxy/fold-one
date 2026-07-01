import { create } from "zustand";
import type { FoldStateEvent } from "@fold/runtime";

interface OverlayStore extends FoldStateEvent {
	voiceLevel: number;
	setState: (partial: Partial<FoldStateEvent>) => void;
	setVoiceLevel: (level: number) => void;
	reset: () => void;
}

export const useOverlayStore = create<OverlayStore>((set) => ({
	status: "idle",
	transcript: "",
	thinkingText: undefined,
	progressMessage: undefined,
	steps: [],
	currentApp: null,
	result: null,
	resultDetail: null,
	error: null,
	askTitle: null,
	askMessage: null,
	askHint: null,
	askOptions: undefined,
	voiceLevel: 0,
	setState: (partial) => set((s) => ({ ...s, ...partial })),
	setVoiceLevel: (level) => set({ voiceLevel: level }),
	reset: () =>
		set({
			status: "idle",
			transcript: "",
			thinkingText: undefined,
			progressMessage: undefined,
			steps: [],
			currentApp: null,
			result: null,
			resultDetail: null,
			error: null,
			askTitle: null,
			askMessage: null,
			askHint: null,
			askOptions: undefined,
			voiceLevel: 0,
		}),
}));
