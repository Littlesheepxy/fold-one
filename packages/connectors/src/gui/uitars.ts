export interface UitarsProbe {
	enabled: boolean;
	available: boolean;
	error?: string;
	model?: string;
}

export interface UitarsTaskInput {
	goal: string;
	budget?: number;
}

export interface UitarsTaskResult {
	ok: boolean;
	summary: string;
	stepsUsed: number;
}

export interface UitarsModelConfig {
	baseURL: string;
	apiKey: string;
	model: string;
}

export function isUitarsEnabled(): boolean {
	return process.env.FOLD_ALLOW_UITARS === "1";
}

export function resolveUitarsModelConfig(): UitarsModelConfig | null {
	const baseURL =
		process.env.FOLD_UITARS_VLM_BASE_URL?.trim() ||
		process.env.OPENROUTER_BASE_URL?.trim() ||
		"https://openrouter.ai/api/v1";
	const apiKey =
		process.env.FOLD_UITARS_VLM_API_KEY?.trim() ||
		process.env.OPENROUTER_API_KEY?.trim() ||
		process.env.OPENAI_API_KEY?.trim() ||
		"";
	const model =
		process.env.FOLD_UITARS_VLM_MODEL?.trim() ||
		process.env.FOLD_UITARS_MODEL?.trim() ||
		"bytedance/ui-tars-1.5-7b";

	if (!apiKey) return null;
	return { baseURL, apiKey, model };
}

export async function probeUitars(): Promise<UitarsProbe> {
	const enabled = isUitarsEnabled();
	if (!enabled) {
		return { enabled: false, available: false };
	}

	const modelConfig = resolveUitarsModelConfig();
	if (!modelConfig) {
		return {
			enabled: true,
			available: false,
			error: "UI-TARS VLM 未配置。请设置 FOLD_UITARS_VLM_API_KEY 或 OpenRouter/OpenAI Key",
		};
	}

	try {
		await import("@ui-tars/sdk");
		await import("@ui-tars/operator-nut-js");
		return {
			enabled: true,
			available: true,
			model: modelConfig.model,
		};
	} catch (error) {
		return {
			enabled: true,
			available: false,
			model: modelConfig.model,
			error: (error as Error).message,
		};
	}
}

export async function executeUitarsTask(input: UitarsTaskInput): Promise<UitarsTaskResult> {
	if (!isUitarsEnabled()) {
		throw new Error("UI-TARS 未启用。请设置 FOLD_ALLOW_UITARS=1");
	}

	const modelConfig = resolveUitarsModelConfig();
	if (!modelConfig) {
		throw new Error(
			"UI-TARS VLM 未配置。请在 Settings 填写 UI-TARS Model/API，或配置 OPENROUTER_API_KEY",
		);
	}

	const [{ GUIAgent }, { NutJSOperator }] = await Promise.all([
		import("@ui-tars/sdk"),
		import("@ui-tars/operator-nut-js"),
	]);

	const budget = Math.max(1, Math.min(input.budget ?? 5, 25));
	const transcripts: string[] = [];
	let stepsUsed = 0;
	let lastStatus = "";

	await new Promise<void>((resolve, reject) => {
		const agent = new GUIAgent({
			model: {
				baseURL: modelConfig.baseURL,
				apiKey: modelConfig.apiKey,
				model: modelConfig.model,
			},
			operator: new NutJSOperator(),
			maxLoopCount: budget,
			onData: ({ data }) => {
				stepsUsed += 1;
				lastStatus = data.status ?? lastStatus;
				const last = data.conversations?.at(-1);
				if (last?.value) transcripts.push(String(last.value).slice(0, 500));
			},
			onError: ({ error }) => {
				reject(error instanceof Error ? error : new Error(String(error)));
			},
		});

		void agent
			.run(input.goal)
			.then(() => resolve())
			.catch(reject);
	});

	const summary =
		transcripts.filter(Boolean).slice(-3).join("\n") ||
		`UI-TARS finished with status ${lastStatus || "unknown"}`;

	return {
		ok: true,
		summary,
		stepsUsed,
	};
}
