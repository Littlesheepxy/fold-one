import { randomUUID } from "node:crypto";
import {
	activateWorkBuddyPairing,
	prepareWorkBuddyPairing,
	stopPairingLoop,
	tryPersistWorkBuddyBridge,
} from "../workbuddy/bridge.js";
import { probeWorkBuddyGateway } from "../workbuddy/index.js";
import { runShellDetailed } from "../shell.js";
import { openInTerminal } from "../terminal.js";
import type { AgentId } from "./types.js";
import type { ConnectFlowKind, ConnectFlowPollResult, ConnectFlowStart } from "../office/auth-flow.js";
import {
	openClaudeLoginInTerminal,
	openCodexInstallInTerminal,
	openCursorSetupInTerminal,
} from "./install-actions.js";

export type AgentConnectTarget =
	| "agent-codex"
	| "agent-claude-code"
	| "agent-cursor"
	| "workbuddy";

const AGENT_CLI: Record<Exclude<AgentConnectTarget, "workbuddy">, { binary: string; agentId: AgentId }> = {
	"agent-codex": { binary: "codex", agentId: "codex" },
	"agent-claude-code": { binary: "claude", agentId: "claude-code" },
	"agent-cursor": { binary: "agent", agentId: "cursor" },
};

const AGENT_META: Record<
	AgentConnectTarget,
	{ title: string; installMessage: string; loginMessage: string }
> = {
	"agent-codex": {
		title: "Codex",
		installMessage:
			"已在终端打开安装向导。按提示完成 npm 全局安装与 codex login，Fold 会自动检测连接状态。",
		loginMessage: "已在终端打开 codex login。完成登录后 Fold 会自动检测。",
	},
	"agent-claude-code": {
		title: "Claude Code",
		installMessage:
			"请先在终端安装 Claude Code CLI（claude），安装完成后点击「打开授权」或在终端运行 claude login。",
		loginMessage: "已在终端打开 claude login。完成登录后 Fold 会自动检测。",
	},
	"agent-cursor": {
		title: "Cursor Agent",
		installMessage:
			"已打开 Cursor 安装页并在终端准备 CLI。安装完成后在终端运行 agent login，Fold 会自动检测。",
		loginMessage: "已在终端打开 agent login。完成登录后 Fold 会自动检测。",
	},
	workbuddy: {
		title: "Work Buddy",
		installMessage: "按下方步骤完成配对，Fold 会自动检测连接状态。",
		loginMessage: "按下方步骤完成配对，Fold 会自动检测连接状态。",
	},
};

interface AgentConnectSession {
	target: AgentConnectTarget;
	kind: ConnectFlowKind;
	startedAt: number;
	isAuthed: () => Promise<boolean>;
}

const sessions = new Map<string, AgentConnectSession>();

export function isAgentConnectTarget(target: string): target is AgentConnectTarget {
	return (
		target === "workbuddy" ||
		target === "agent-codex" ||
		target === "agent-claude-code" ||
		target === "agent-cursor"
	);
}

async function probeAgentCli(binary: string): Promise<boolean> {
	const result = await runShellDetailed(binary, ["--version"], 5000);
	return result.exitCode === 0;
}

async function isAgentAuthed(target: Exclude<AgentConnectTarget, "workbuddy">): Promise<boolean> {
	const { binary } = AGENT_CLI[target];
	return probeAgentCli(binary);
}

function launchAgentSetup(target: Exclude<AgentConnectTarget, "workbuddy">, kind: ConnectFlowKind): void {
	if (target === "agent-codex") {
		openCodexInstallInTerminal();
		return;
	}
	if (target === "agent-claude-code") {
		if (kind === "login") openClaudeLoginInTerminal();
		else openInTerminal("npm i -g @anthropic-ai/claude-code && claude --version && claude login");
		return;
	}
	openCursorSetupInTerminal(kind);
}

export async function startAgentConnectFlow(
	target: AgentConnectTarget,
	kind: ConnectFlowKind,
): Promise<ConnectFlowStart> {
	const meta = AGENT_META[target];
	const sessionId = randomUUID();

	if (target === "workbuddy") {
		const pairing = prepareWorkBuddyPairing();
		sessions.set(sessionId, {
			target,
			kind,
			startedAt: Date.now(),
			isAuthed: async () => {
				tryPersistWorkBuddyBridge();
				return (await probeWorkBuddyGateway({ requireEnabled: false })).available;
			},
		});
		return {
			sessionId,
			target,
			kind,
			title: `连接 ${meta.title}`,
			message: meta.loginMessage,
			copyText: pairing.copyText,
			copyThenOpen: true,
		};
	}

	const { binary } = AGENT_CLI[target];
	const installed = await probeAgentCli(binary);
	const effectiveKind = installed ? "login" : "install";
	launchAgentSetup(target, effectiveKind);

	sessions.set(sessionId, {
		target,
		kind: effectiveKind,
		startedAt: Date.now(),
		isAuthed: async () => isAgentAuthed(target),
	});

	return {
		sessionId,
		target,
		kind: effectiveKind,
		title: installed ? `登录 ${meta.title}` : `安装 ${meta.title}`,
		message: installed ? meta.loginMessage : meta.installMessage,
	};
}

export async function pollAgentConnectFlow(
	sessionId: string,
): Promise<ConnectFlowPollResult | null> {
	const session = sessions.get(sessionId);
	if (!session) return null;

	if (session.target === "workbuddy") {
		tryPersistWorkBuddyBridge();
		const probe = await probeWorkBuddyGateway({ requireEnabled: false });
		if (probe.available) {
			stopPairingLoop(sessionId);
			sessions.delete(sessionId);
			return { status: "success", message: "已连接" };
		}
		if (Date.now() - session.startedAt > 10 * 60_000) {
			stopPairingLoop(sessionId);
			sessions.delete(sessionId);
			return {
				status: "error",
				error: probe.error ?? "连接超时。请复制配对命令到 WorkBuddy 发送后重试",
			};
		}
		return {
			status: "pending",
			message: probe.error ?? "等待 WorkBuddy 完成配对…",
		};
	}

	if (await session.isAuthed()) {
		sessions.delete(sessionId);
		return { status: "success", message: "已连接" };
	}

	if (Date.now() - session.startedAt > 10 * 60_000) {
		sessions.delete(sessionId);
		return { status: "error", error: "连接超时，请确认已完成安装或登录后重试" };
	}

	return { status: "pending" };
}

export function cancelAgentConnectFlow(sessionId: string): void {
	stopPairingLoop(sessionId);
	sessions.delete(sessionId);
}

export function activateWorkBuddyConnectFlow(sessionId: string): { opened: boolean; url?: string } {
	const session = sessions.get(sessionId);
	if (!session || session.target !== "workbuddy") return { opened: false };
	return activateWorkBuddyPairing(sessionId);
}
