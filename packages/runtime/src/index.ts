export { runTask, runMockTask } from "./orchestrator.js";
export {
	canUseSmartAction,
	consumeTrialSmartAction,
	INITIAL_TRIAL_SMART_ACTIONS,
	normalizePlanTier,
	remainingTrialSmartActions,
	resolveEntitlements,
	type Entitlements,
	type PlanTier,
	type UpgradeReason,
} from "./entitlements.js";
export {
	buildPredictions,
	buildSituationFingerprint,
	clearPredictCache,
	episodeSituationFingerprint,
	getPredictCacheKey,
	getPredictions,
	needsScreenCalibration,
	refreshPredictCache,
	similarityScore,
	type PredictEnrichment,
	type PredictMode,
	type PredictPhase,
	type PredictResult,
	type PredictSuggestion,
	type SituationFingerprint,
} from "./predict.js";
export { generatePredictDrafts, type PredictDraftLine } from "./predict-drafts.js";
export {
	shouldCleanSpeechLocally,
	structureSpeechText,
	type StructuredSpeech,
} from "@fold/ai";
export { hasPlannerApiKey } from "@fold/ai";
export { inferPredictSurface, surfaceActionLabel, type PredictSurface } from "./predict-surface.js";
export { predictContextSnippet } from "./predict-fallback.js";
export { extractEntityTokens } from "./entity-extract.js";
export {
	formatPlannerMemory,
	formatTracesForPlanner,
	retrieveSimilarTraces,
	type EpisodeTrace,
} from "./trace-retrieval.js";
export {
	anchorFromObjects,
	primaryInformationObject,
	resolveInformationObjects,
	type InformationObject,
	type InformationObjectInput,
	type InformationObjectKind,
} from "./information-object.js";
export {
	matchRoutinesForTrail,
	mineRoutinesFromEpisodes,
	trailTokensFromEpisode,
	type MinedRoutine,
} from "./routine-mining.js";
export {
	buildResultDetail,
	buildUserVisibleSummary,
	formatEpisodeSummaryDisplay,
	formatThinkingText,
	isRawPayloadText,
	summaryFromJsonPayload,
} from "./format-result.js";
export { labelForSkill, labelForStep } from "./step-labels.js";
export {
	buildProfileImportPrompt,
	parseProfileImportResponse,
	type ProfileImportFields,
} from "./profile-prompt.js";
export { runPlan } from "./executor.js";
export { formatRelevantEpisodes } from "./episode-context.js";
export { formatProbeSummary, runProbes } from "./probe-runner.js";
export {
	resolveTier,
	tryCompiledPlan,
	type ExecutionTier,
	type RouteDecision,
} from "./router.js";
export { validatePlan } from "./validator.js";
export { buildReactAgentPlan, buildRepairBrief } from "./repair.js";
export { isGuiIntent } from "./capability-resolver.js";
export {
	buildRecoveryPlan,
	classifyFailure,
	DEFAULT_REPAIR_BUDGET,
	GUI_REPAIR_BUDGET,
	handleFailure,
	resolveRepairBudget,
	selectRepairBackend,
	type RecoveryAction,
	type RepairBackend,
	type RepairBudget,
} from "./recovery.js";
export {
	getAgentProbe,
	getCdpConnected,
	getUitarsProbe,
	getWorkbuddyProbe,
	runRecoveryLoop,
	type RecoveryRunResult,
} from "./recovery-runner.js";
export type {
	FoldStateEvent,
	OverlayStatus,
	OrchestratorDeps,
	StateEmitter,
	StepView,
	TaskResult,
	StepResult,
	UserActionRequest,
} from "./types.js";
