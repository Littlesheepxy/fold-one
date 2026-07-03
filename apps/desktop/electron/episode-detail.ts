import { getEpisodeById, listRecentEpisodes, type Episode, type EpisodeSummary as MemoryEpisodeSummary } from "@fold/memory";
import {
	buildResultDetail,
	formatEpisodeSummaryDisplay,
	formatThinkingText,
	isRawPayloadText,
	labelForStep,
	summaryFromJsonPayload,
	type StepResult,
} from "@fold/runtime";
import type { ActionPlan } from "@fold/ai";
import { resolveAppBundlePath } from "./app-icon.js";

export interface EpisodeListItem {
	id: string;
	intent: string;
	goal: string;
	status: string;
	timestamp: number;
	summary: string;
	durationMs: number;
	steps: Array<{ stepId: string; skill: string; label: string; status: string }>;
	apps: Array<{ name: string; path?: string | null }>;
	stepCount: number;
	successCount: number;
}

export interface EpisodeDetailDTO {
	id: string;
	intent: string;
	goal: string;
	status: string;
	timestamp: number;
	summary: string;
	durationMs: number;
	thinkingText: string;
	resultDetail: string | null;
	probeSummary: string | null;
	steps: Array<{
		stepId: string;
		label: string;
		skill: string;
		status: string;
		durationMs: number;
		error?: string;
	}>;
	validationChecks: Array<{ rule: string; passed: boolean; message?: string }>;
	contextEvents: Array<{
		id: string;
		type: string;
		timestamp: number;
		data: {
			appName?: string;
			windowTitle?: string;
			appPath?: string;
			filePath?: string;
			url?: string;
			text?: string;
		};
	}>;
}

export function listEpisodesForHome(limit = 50): EpisodeListItem[] {
	return listRecentEpisodes(limit).map(buildEpisodeListItem);
}

function buildEpisodeListItem(ep: Episode): EpisodeListItem {
	const summaryObj = parseJson<MemoryEpisodeSummary | null>(ep.summaryJson, null);
	const rawSteps = parseJson<EpisodeStep[]>(ep.stepsJson, []);
	const plan = parseJson<ActionPlan | null>(ep.planJson, null);
	const steps = rawSteps.map((step) => ({
		stepId: step.stepId,
		skill: step.skill,
		label:
			step.label ??
			labelForStep(step.skill, { args: plan?.steps.find((s) => s.id === step.stepId)?.args }),
		status: step.status,
	}));
	const contextEvents = parseJson<Array<{ type?: string; data?: { appName?: string; appPath?: string } }>>(
		ep.contextEventsJson,
		[],
	);

	const apps = new Map<string, { name: string; path?: string | null }>();
	for (const evt of contextEvents) {
		if (evt.type === "app.active" && evt.data?.appName) {
			const path = evt.data.appPath ?? resolveAppBundlePath(evt.data.appName);
			apps.set(evt.data.appName, { name: evt.data.appName, path: path ?? null });
		}
	}
	for (const name of summaryObj?.apps ?? []) {
		if (!apps.has(name)) {
			apps.set(name, { name, path: resolveAppBundlePath(name) });
		}
	}
	for (const [name, app] of apps) {
		if (!app.path) apps.set(name, { ...app, path: resolveAppBundlePath(name) });
	}

	return {
		id: ep.id,
		intent: ep.intent,
		goal: ep.goal,
		status: ep.status,
		timestamp: ep.timestamp,
		summary: resolveEpisodeSummary(ep, rawSteps),
		durationMs: ep.durationMs,
		steps,
		apps: [...apps.values()],
		stepCount: steps.length,
		successCount: steps.filter((s) => s.status === "success").length,
	};
}

function parseJson<T>(value: string | undefined | null, fallback: T): T {
	if (!value) return fallback;
	try {
		return JSON.parse(value) as T;
	} catch {
		return fallback;
	}
}

function resolveThinkingText(ep: Episode): string {
	if (ep.thinkingText?.trim()) return ep.thinkingText.trim();
	try {
		const plan = JSON.parse(ep.planJson) as Parameters<typeof formatThinkingText>[1];
		return formatThinkingText(ep.intent, plan, ep.probeSummary ?? undefined);
	} catch {
		return ep.intent;
	}
}

function resolveResultDetail(ep: Episode, rawSteps: EpisodeStep[]): string | null {
	const stored = ep.resultDetail?.trim();
	if (stored && !isRawPayloadText(stored)) return stored;

	if (rawSteps.length > 0) {
		const built = buildResultDetail(
			ep.intent,
			rawSteps as Array<Pick<StepResult, "skill" | "status" | "output" | "error">>,
		);
		if (built && !isRawPayloadText(built)) return built;
	}

	if (stored) {
		const fromJson = summaryFromJsonPayload(stored);
		if (fromJson) return fromJson;
	}
	return null;
}

function resolveEpisodeSummary(ep: Episode, rawSteps: EpisodeStep[]): string {
	return formatEpisodeSummaryDisplay({
		summary: ep.summary,
		resultDetail: resolveResultDetail(ep, rawSteps),
		intent: ep.intent,
		status: ep.status,
	});
}

type EpisodeStep = {
	stepId: string;
	skill: string;
	status: string;
	durationMs: number;
	error?: string;
	label?: string;
};

export function buildEpisodeDetail(id: string): EpisodeDetailDTO | null {
	const ep = getEpisodeById(id);
	if (!ep) return null;

	const rawSteps = parseJson<EpisodeStep[]>(ep.stepsJson, []);
	const plan = parseJson<ActionPlan | null>(ep.planJson, null);
	const steps = rawSteps.map((step) => ({
		...step,
		label:
			step.label ??
			labelForStep(step.skill, { args: plan?.steps.find((s) => s.id === step.stepId)?.args }),
	}));
	const resultDetail = resolveResultDetail(ep, rawSteps);

	return {
		id: ep.id,
		intent: ep.intent,
		goal: ep.goal,
		status: ep.status,
		timestamp: ep.timestamp,
		summary: resolveEpisodeSummary(ep, rawSteps),
		durationMs: ep.durationMs,
		thinkingText: resolveThinkingText(ep),
		resultDetail,
		probeSummary: ep.probeSummary ?? null,
		steps,
		validationChecks: parseJson(ep.validationJson, []),
		contextEvents: parseJson(ep.contextEventsJson, []).map((event, index) => ({
			id: (event as { id?: string }).id ?? `${ep.id}-ctx-${index}`,
			type: (event as { type?: string }).type ?? "unknown",
			timestamp: (event as { timestamp?: number }).timestamp ?? ep.timestamp,
			data: ((event as { data?: EpisodeDetailDTO["contextEvents"][0]["data"] }).data ?? {}) as EpisodeDetailDTO["contextEvents"][0]["data"],
		})),
	};
}
