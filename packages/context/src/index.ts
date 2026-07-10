export { ContextEngine } from "./engine.js";
export { ContextStore } from "./store.js";
export {
	createEmptyContext,
	formatContextBrief,
	formatContextSummary,
} from "./types.js";
export type {
	ContextBriefScope,
	ContextEvent,
	FocusDwell,
	LiveContext,
} from "./types.js";
export {
	computeFocusDwells,
	currentFocusDwellMs,
	formatDwellDuration,
	formatFocusDwellBrief,
} from "./dwell.js";
export {
	hedgedPrefix,
	scoreContextConfidence,
	type ContextConfidence,
	type ContextConfidenceLevel,
} from "./confidence.js";
export { defaultWatchRoots, FILE_WATCH_IGNORED, mergeWatchRoots, watchRootsFromEnv, type WatchRoot } from "./watch-paths.js";
