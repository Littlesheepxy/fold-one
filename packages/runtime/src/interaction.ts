import type {
	UserActionInputPolicy,
	UserActionKind,
	UserActionOption,
	UserActionRequest,
	UserActionRisk,
} from "./types.js";

const TERMINAL_ID = /terminal|login|install|auth|oauth/i;
const PERMISSION_ID = /permission|open-settings|screen:|accessibility:|cdp:/i;
const DESTRUCTIVE_ID = /delete|remove|drop|revoke|destroy/i;
const CANCEL_ID = /^(cancel|deny|reject|abort|stop)$/i;
const ALLOW_ID = /allow|confirm|approve|ok|send|允许|确认|同意|发送/i;
const EDIT_ID = /edit|修改|编辑/i;

function resolveKind(request: UserActionRequest): UserActionKind {
	if (request.kind) return request.kind;
	const ids = request.options.map((option) => option.id);
	if (ids.some((id) => /secret|password|token|api[-_:]?key/i.test(id))) return "secret";
	if (ids.some((id) => TERMINAL_ID.test(id))) return "terminal";
	if (ids.some((id) => PERMISSION_ID.test(id))) return "permission";
	if (request.options.length <= 2 && ids.some((id) => CANCEL_ID.test(id))) return "confirm";
	return "select";
}

function resolveRisk(request: UserActionRequest, kind: UserActionKind): UserActionRisk {
	if (request.risk) return request.risk;
	if (request.options.some((option) => DESTRUCTIVE_ID.test(option.id))) return "destructive";
	if (kind === "permission" || kind === "secret" || kind === "terminal") return "sensitive";
	return "low";
}

function defaultAliases(option: UserActionOption): string[] {
	const aliases = [option.label, ...(option.voiceAliases ?? [])];
	const key = `${option.id} ${option.label}`;
	if (ALLOW_ID.test(key)) aliases.push("允许", "确认", "同意", "好的", "可以");
	if (EDIT_ID.test(key)) aliases.push("编辑", "改一下", "修改后再发");
	if (CANCEL_ID.test(option.id) || /取消|不要/.test(option.label)) {
		aliases.push("取消", "不要", "算了", "停止");
	}
	return Array.from(new Set(aliases.filter(Boolean)));
}

function normalizeOptions(options: UserActionOption[]): UserActionOption[] {
	return options.map((option, index) => ({
		...option,
		tone:
			option.tone ??
			(CANCEL_ID.test(option.id)
				? "danger"
				: index === 0
					? "primary"
					: "secondary"),
		voiceAliases: defaultAliases(option),
	}));
}

function resolveInput(
	request: UserActionRequest,
	kind: UserActionKind,
): UserActionInputPolicy {
	const defaults: UserActionInputPolicy =
		kind === "secret"
			? { primary: "secure", allowVoice: false, allowText: true, acceptFreeform: true }
			: kind === "text" || kind === "form"
				? { primary: "voice", allowVoice: true, allowText: true, acceptFreeform: true }
				: kind === "terminal"
					? { primary: "terminal", allowVoice: true, allowText: true, acceptFreeform: false }
					: {
							// confirm / select / permission：先点选项，语音是加速器不是主路径
							primary: "choice",
							allowVoice: true,
							allowText: true,
							acceptFreeform: false,
						};
	return { ...defaults, ...request.input };
}

export interface NormalizedUserActionRequest extends UserActionRequest {
	kind: UserActionKind;
	risk: UserActionRisk;
	input: UserActionInputPolicy;
	collapsible: boolean;
	options: UserActionOption[];
}

/** Apply product policy before a HITL request reaches any surface. */
export function normalizeUserActionRequest(
	request: UserActionRequest,
): NormalizedUserActionRequest {
	const kind = resolveKind(request);
	return {
		...request,
		kind,
		risk: resolveRisk(request, kind),
		input: resolveInput(request, kind),
		collapsible: request.collapsible ?? true,
		options: normalizeOptions(request.options),
	};
}

function normalizeSpeech(value: string): string {
	return value
		.toLocaleLowerCase("zh-CN")
		.replace(/[\s，。！？、,.!?;；:：'“”\"（）()【】\[\]-]/g, "");
}

/** 整句才认序数，避免「允许这一次」里的「一」误命中第一项。 */
const ORDINALS: RegExp[] = [
	/^(选|选项)?(第?一(个|项)?|1)$/,
	/^(选|选项)?(第?二(个|项)?|2)$/,
	/^(选|选项)?(第?三(个|项)?|3)$/,
	/^(选|选项)?(第?四(个|项)?|4)$/,
];

/** Match speech to the current node's options without letting speech invent permission. */
export function matchUserActionVoice(
	transcript: string,
	options: UserActionOption[],
): UserActionOption | null {
	const speech = normalizeSpeech(transcript);
	if (!speech) return null;

	// 1) 整句精确匹配别名
	for (const option of options) {
		for (const alias of option.voiceAliases ?? [option.label]) {
			const normalizedAlias = normalizeSpeech(alias);
			if (normalizedAlias && speech === normalizedAlias) return option;
		}
	}

	// 2) 包含匹配：取最长别名，避免「编辑后发送」命中短词「发送/允许」
	let best: { option: UserActionOption; length: number } | null = null;
	for (const option of options) {
		for (const alias of option.voiceAliases ?? [option.label]) {
			const normalizedAlias = normalizeSpeech(alias);
			if (!normalizedAlias || normalizedAlias.length < 2) continue;
			if (!speech.includes(normalizedAlias)) continue;
			if (!best || normalizedAlias.length > best.length) {
				best = { option, length: normalizedAlias.length };
			}
		}
	}
	if (best) return best.option;

	if (/^(最后(一个|一项)?)$/.test(speech)) return options.at(-1) ?? null;
	for (let index = 0; index < Math.min(options.length, ORDINALS.length); index++) {
		if (ORDINALS[index]!.test(speech)) return options[index] ?? null;
	}

	if (/取消|不要|停止|算了/.test(speech)) {
		return options.find((option) => CANCEL_ID.test(option.id)) ?? null;
	}
	return null;
}
