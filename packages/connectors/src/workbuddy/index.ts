import {
	isWorkflowPayload,
	parseMcpToolPayload,
	payloadHasError,
	pickFirstCapability,
	summarizeMcpPayload,
	withWorkBuddyMcp,
} from "./mcp-client.js";

export interface WorkBuddyProbe {
	enabled: boolean;
	available: boolean;
	gatewayUrl: string;
	error?: string;
}

export interface WorkBuddyRunInput {
	capability?: string;
	query: string;
	params?: Record<string, unknown>;
	/** After wb_search, auto-run the best match (default true). */
	autoRun?: boolean;
}

export interface WorkBuddyRunResult {
	ok: boolean;
	summary: string;
	backend: "mcp-gateway";
	capability?: string;
}

const DEFAULT_GATEWAY = "http://127.0.0.1:5126";
const MAX_WORKFLOW_STEPS = 20;

export function getWorkBuddyGatewayUrl(): string {
	return process.env.FOLD_WORKBUDDY_GATEWAY_URL?.trim() || DEFAULT_GATEWAY;
}

export function isWorkBuddyEnabled(): boolean {
	return process.env.FOLD_ALLOW_WORKBUDDY !== "0";
}

export async function probeWorkBuddyGateway(): Promise<WorkBuddyProbe> {
	const gatewayUrl = getWorkBuddyGatewayUrl();
	if (!isWorkBuddyEnabled()) {
		return { enabled: false, available: false, gatewayUrl };
	}
	try {
		const response = await fetch(`${gatewayUrl.replace(/\/$/, "")}/health`, {
			signal: AbortSignal.timeout(2000),
		});
		if (!response.ok) {
			return {
				enabled: true,
				available: false,
				gatewayUrl,
				error: `health check failed: HTTP ${response.status}`,
			};
		}
		return { enabled: true, available: true, gatewayUrl };
	} catch (error) {
		return {
			enabled: true,
			available: false,
			gatewayUrl,
			error: (error as Error).message,
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

		payload = await callMcpTool(client, "wb_advance", {
			workflow_run_id: payload.workflow_run_id,
			step_result: { ok: true },
		});
		if (payloadHasError(payload)) break;
	}
	return payload;
}

export async function executeWorkBuddyTask(input: WorkBuddyRunInput): Promise<WorkBuddyRunResult> {
	const probe = await probeWorkBuddyGateway();
	if (!probe.available) {
		throw new Error(
			`Work Buddy MCP gateway 不可用（${probe.gatewayUrl}）。请先启动 work-buddy sidecar。`,
		);
	}

	return withWorkBuddyMcp(probe.gatewayUrl, async (client) => {
		let capability = input.capability?.trim();

		if (!capability || capability === "wb_search") {
			const searchPayload = await callMcpTool(client, "wb_search", {
				query: input.query,
				...(input.params ?? {}),
			});

			if (input.capability === "wb_search" && input.autoRun === false) {
				return {
					ok: !payloadHasError(searchPayload),
					summary: summarizeMcpPayload(searchPayload),
					backend: "mcp-gateway",
					capability: "wb_search",
				};
			}

			const picked = pickFirstCapability(searchPayload);
			if (!picked) {
				return {
					ok: false,
					summary: summarizeMcpPayload(searchPayload) || "No matching Work Buddy capability",
					backend: "mcp-gateway",
					capability: "wb_search",
				};
			}
			capability = picked;
		}

		const runPayload = await callMcpTool(client, "wb_run", {
			capability,
			params: input.params ?? { query: input.query },
		});
		const finalPayload = isWorkflowPayload(runPayload)
			? await runWorkflow(client, runPayload)
			: runPayload;

		return {
			ok: !payloadHasError(finalPayload),
			summary: summarizeMcpPayload(finalPayload),
			backend: "mcp-gateway",
			capability,
		};
	});
}
