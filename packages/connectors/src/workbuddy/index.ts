import { randomUUID } from "node:crypto";
import {
	createLocalTaskEmitter,
	parseLocalTaskReturn,
	type LocalTaskArtifact,
	type LocalTaskEvent,
	type LocalTaskEventCallback,
	type MemoryCandidate,
} from "../task-events.js";
import {
	isWorkflowPayload,
	parseMcpToolPayload,
	payloadHasError,
	pickFirstCapability,
	probeWorkBuddyMcp,
	summarizeMcpPayload,
	withWorkBuddyMcp,
} from "./mcp-client.js";
import {
	discoverWorkBuddyGatewayUrl,
	discoverWorkBuddyMcpAuthHeader,
	discoverWorkBuddyMcpTokenFromProcess,
	isManualWorkBuddyMcpToken,
	isWorkBuddyAppProcessRunning,
	resolveWorkBuddyGatewayUrl,
} from "./discover.js";
import { resolveWorkBuddyMcpToken, readWorkBuddyBridgeGatewayUrl, tryPersistWorkBuddyBridge } from "./bridge.js";
import { isWorkBuddyAppInstalled } from "./app.js";

export {
	discoverWorkBuddyGatewayUrl,
	discoverWorkBuddyMcpAuthHeader,
	discoverWorkBuddyMcpTokenFromProcess,
	isManualWorkBuddyMcpToken,
	isWorkBuddyAppProcessRunning,
	resolveWorkBuddyGatewayUrl,
} from "./discover.js";
export {
	beginWorkBuddyPairing,
	getWorkBuddyPairingPhrase,
	launchWorkBuddyPairScriptInTerminal,
	resolveWorkBuddyMcpToken,
	tryPersistWorkBuddyBridge,
} from "./bridge.js";

export interface WorkBuddyProbe {
	enabled: boolean;
	available: boolean;
	gatewayUrl: string;
	toolCount?: number;
	/** MCP 工具名（最多 64），供分流粗匹配 */
	toolNames?: string[];
	error?: string;
}

export type WorkBuddyProbeOptions = {
	/** 连接页配对时应探测真实 Gateway 状态，不受执行能力开关影响 */
	requireEnabled?: boolean;
};

export interface WorkBuddyRunInput {
	taskId?: string;
	capability?: string;
	query: string;
	params?: Record<string, unknown>;
	/** After search, auto-run the best match (legacy sidecar only). */
	autoRun?: boolean;
	onEvent?: LocalTaskEventCallback;
}

interface WorkBuddyCoreResult {
	ok: boolean;
	summary: string;
	backend: "mcp-gateway";
	capability?: string;
}

export interface WorkBuddyRunResult extends WorkBuddyCoreResult {
	taskId: string;
	events: LocalTaskEvent[];
	artifacts: LocalTaskArtifact[];
	memoryCandidates: MemoryCandidate[];
}

const DEFAULT_GATEWAY = "http://127.0.0.1:5126";
const MAX_WORKFLOW_STEPS = 20;
const LEGACY_SEARCH_TOOL = "wb_search";
const MODERN_SEARCH_TOOL = "conversation_search";

export function getWorkBuddyGatewayUrl(): string {
	return (
		resolveWorkBuddyGatewayUrl() ||
		readWorkBuddyBridgeGatewayUrl() ||
		DEFAULT_GATEWAY
	);
}

export function isWorkBuddyEnabled(): boolean {
	return process.env.FOLD_ALLOW_WORKBUDDY !== "0";
}

export async function probeWorkBuddyGateway(
	options: WorkBuddyProbeOptions = {},
): Promise<WorkBuddyProbe> {
	const requireEnabled = options.requireEnabled ?? true;
	const gatewayUrl = getWorkBuddyGatewayUrl();
	const runtimeEnabled = isWorkBuddyEnabled();
	if (requireEnabled && !runtimeEnabled) {
		return { enabled: false, available: false, gatewayUrl };
	}

	const discoveredUrl = resolveWorkBuddyGatewayUrl();
	const appRunning = isWorkBuddyAppProcessRunning();
	const appInstalled = isWorkBuddyAppInstalled();

	try {
		const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/health`, {
			signal: AbortSignal.timeout(2500),
		});
		if (!response.ok) {
			return {
				enabled: runtimeEnabled,
				available: false,
				gatewayUrl,
				error: appRunning
					? "WorkBuddy Gateway 未就绪，请确认已登录并保持应用运行"
					: "请先打开 WorkBuddy 并登录账号",
			};
		}

		const token = resolveWorkBuddyMcpToken();
		if (!token) {
			return {
				enabled: runtimeEnabled,
				available: false,
				gatewayUrl,
				error:
					"WorkBuddy 已启动，请在应用中新建或打开任意对话，然后点击重新检测",
			};
		}

		const mcp = await probeWorkBuddyMcp(gatewayUrl);
		if (mcp.ok) {
			tryPersistWorkBuddyBridge();
		}
		if (!mcp.ok) {
			const staleManual =
				isManualWorkBuddyMcpToken() &&
				/401|unauthorized/i.test(mcp.error ?? "");
			return {
				enabled: runtimeEnabled,
				available: false,
				gatewayUrl,
				error: staleManual
					? "WorkBuddy 令牌已过期，请清除设置中的 WorkBuddy Token 后重试"
					: (mcp.error ?? "MCP 握手失败"),
			};
		}
		return {
			enabled: runtimeEnabled,
			available: true,
			gatewayUrl: discoveredUrl ?? gatewayUrl,
			toolCount: mcp.toolCount,
			toolNames: mcp.toolNames,
		};
	} catch (error) {
		const message = (error as Error).message;
		return {
			enabled: runtimeEnabled,
			available: false,
			gatewayUrl,
			error: discoveredUrl
				? appRunning
					? `Gateway 暂不可用（${message}）`
					: "请先打开 WorkBuddy 并登录账号"
				: appRunning
					? "WorkBuddy 正在启动，请稍候再试"
					: appInstalled
						? "WorkBuddy 已安装，请打开应用并登录账号"
						: "未检测到 WorkBuddy，请先安装并打开应用",
		};
	}
}

async function callMcpTool(
	client: Parameters<Parameters<typeof withWorkBuddyMcp>[1]>[0],
	name: string,
	args: Record<string, unknown>,
) {
	const result = await client.callTool({ name, arguments: args });
	return parseMcpToolPayload(result as Parameters<typeof parseMcpToolPayload>[0]);
}

async function runWorkflow(
	client: Parameters<Parameters<typeof withWorkBuddyMcp>[1]>[0],
	initialPayload: unknown,
	onStep?: (step: number) => void,
): Promise<unknown> {
	let payload = initialPayload;
	let steps = 0;
	while (isWorkflowPayload(payload)) {
		if (steps++ >= MAX_WORKFLOW_STEPS) {
			return { ...payload, error: "Work Buddy workflow step budget exceeded" };
		}
		const completed =
			payload &&
			typeof payload === "object" &&
			((payload as { completed?: boolean }).completed === true ||
				(payload as { status?: string }).status === "completed");
		if (completed) break;
		onStep?.(steps);

		payload = await callMcpTool(client, "wb_advance", {
			workflow_run_id: payload.workflow_run_id,
			step_result: { ok: true },
		});
		if (payloadHasError(payload)) break;
	}
	return payload;
}

async function executeLegacySidecar(
	client: Parameters<Parameters<typeof withWorkBuddyMcp>[1]>[0],
	input: WorkBuddyRunInput,
	onProgress?: (message: string) => void,
): Promise<WorkBuddyCoreResult> {
	let capability = input.capability?.trim();

	if (!capability || capability === LEGACY_SEARCH_TOOL) {
		onProgress?.("正在匹配 WorkBuddy 能力");
		const searchPayload = await callMcpTool(client, LEGACY_SEARCH_TOOL, {
			query: input.query,
			...(input.params ?? {}),
		});

		if (input.capability === LEGACY_SEARCH_TOOL && input.autoRun === false) {
			return {
				ok: !payloadHasError(searchPayload),
				summary: summarizeMcpPayload(searchPayload),
				backend: "mcp-gateway",
				capability: LEGACY_SEARCH_TOOL,
			};
		}

		const picked = pickFirstCapability(searchPayload);
		if (!picked) {
			return {
				ok: false,
				summary: summarizeMcpPayload(searchPayload) || "No matching Work Buddy capability",
				backend: "mcp-gateway",
				capability: LEGACY_SEARCH_TOOL,
			};
		}
		capability = picked;
	}

	const runPayload = await callMcpTool(client, "wb_run", {
		capability,
		params: input.params ?? { query: input.query },
	});
	const finalPayload = isWorkflowPayload(runPayload)
		? await runWorkflow(client, runPayload, (step) => onProgress?.(`WorkBuddy 正在执行第 ${step} 步`))
		: runPayload;

	return {
		ok: !payloadHasError(finalPayload),
		summary: summarizeMcpPayload(finalPayload),
		backend: "mcp-gateway",
		capability,
	};
}

async function executeModernGateway(
	client: Parameters<Parameters<typeof withWorkBuddyMcp>[1]>[0],
	input: WorkBuddyRunInput,
	toolNames: Set<string>,
	onProgress?: (message: string) => void,
): Promise<WorkBuddyCoreResult> {
	const capability = input.capability?.trim();
	const searchTool = toolNames.has(MODERN_SEARCH_TOOL) ? MODERN_SEARCH_TOOL : null;

	if (capability && capability !== LEGACY_SEARCH_TOOL && toolNames.has(capability)) {
		onProgress?.(`正在调用 WorkBuddy：${capability}`);
		const payload = await callMcpTool(client, capability, input.params ?? { query: input.query });
		return {
			ok: !payloadHasError(payload),
			summary: summarizeMcpPayload(payload),
			backend: "mcp-gateway",
			capability,
		};
	}

	if (!searchTool) {
		return {
			ok: false,
			summary: `WorkBuddy Gateway 未提供 ${MODERN_SEARCH_TOOL} 工具`,
			backend: "mcp-gateway",
		};
	}

	onProgress?.("正在请求 WorkBuddy 处理");
	const searchPayload = await callMcpTool(client, searchTool, {
		query: input.query,
		...(input.params ?? {}),
	});
	return {
		ok: !payloadHasError(searchPayload),
		summary: summarizeMcpPayload(searchPayload),
		backend: "mcp-gateway",
		capability: searchTool,
	};
}

export async function executeWorkBuddyTask(input: WorkBuddyRunInput): Promise<WorkBuddyRunResult> {
	const taskId = input.taskId ?? randomUUID();
	const events: LocalTaskEvent[] = [];
	const emit = createLocalTaskEmitter({
		taskId,
		source: "workbuddy",
		onEvent: input.onEvent,
		events,
	});
	emit("queued", "WorkBuddy 任务已进入队列");
	emit("starting", "正在连接 WorkBuddy 客户端");
	try {
		const probe = await probeWorkBuddyGateway({ requireEnabled: false });
		if (!probe.available) {
			throw new Error(
				probe.error ??
					`Work Buddy MCP gateway 不可用（${probe.gatewayUrl}）。请先启动 WorkBuddy 桌面版。`,
			);
		}

		const result = await withWorkBuddyMcp(probe.gatewayUrl, async (client) => {
			const tools = await client.listTools();
			const toolNames = new Set(tools.tools.map((tool) => tool.name));
			const onProgress = (message: string) => emit("working", message);
			if (toolNames.has(LEGACY_SEARCH_TOOL) && toolNames.has("wb_run")) {
				return executeLegacySidecar(client, input, onProgress);
			}
			return executeModernGateway(client, input, toolNames, onProgress);
		});
		const returned = parseLocalTaskReturn(result.summary);
		emit(result.ok ? "succeeded" : "failed", result.ok ? "WorkBuddy 任务已完成" : result.summary);
		return {
			...result,
			summary: returned.summary || result.summary,
			taskId,
			events,
			artifacts: returned.artifacts,
			memoryCandidates: returned.memoryCandidates,
		};
	} catch (error) {
		emit("failed", (error as Error).message || "WorkBuddy 任务失败");
		throw error;
	}
}
