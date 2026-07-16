import { randomUUID } from "node:crypto";
import {
	activateWorkBuddyPairing,
	stopPairingLoop,
	tryPersistWorkBuddyBridge,
} from "../workbuddy/bridge.js";
import { probeWorkBuddyGateway } from "../workbuddy/index.js";
import { isWorkBuddyAppInstalled, openWorkBuddyApp } from "../workbuddy/app.js";
import { runShellDetailed } from "../shell.js";
import { openInTerminal } from "../terminal.js";
import type { AgentId } from "./types.js";
import type { ConnectFlowKind, ConnectFlowPollResult, ConnectFlowStart } from "../office/auth-flow.js";
import { isCodexAppInstalled, openCodexApp } from "./codex-app.js";
import { openCursorAgentInstall, startCursorBrowserLogin } from "./cursor-app.js";
import { openClaudeLoginInTerminal } from "./install-actions.js";

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
			"安装并登录 Codex 后，知更就能直接调用它完成复杂任务。",
		loginMessage: "打开 Codex 完成登录，知更会自动检测并连接。",
	},
	"agent-claude-code": {
		title: "Claude Code",
		installMessage:
			"Claude Code 尚未安装。点击下方按钮打开终端，完成安装和登录后，知更会自动检测。",
		loginMessage: "Claude Code 已安装，但尚未登录。点击下方按钮打开终端完成登录。",
	},
	"agent-cursor": {
		title: "Cursor Agent",
		installMessage:
			"安装 Cursor Agent 后，知更就能直接调用它完成复杂任务。",
		loginMessage: "在浏览器完成 Cursor 登录，知更会自动检测并连接。",
	},
	workbuddy: {
		title: "Work Buddy",
		installMessage: "安装并登录 Work Buddy 后，知更就能直接调用其中的能力。",
		loginMessage: "知更会打开 Work Buddy 并自动连接；如尚未登录，请在客户端完成登录。",
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
	if (!(await probeAgentCli(binary))) return false;
	const args =
		target === "agent-claude-code"
			? ["auth", "status"]
			: target === "agent-codex"
				? ["login", "status"]
				: ["status"];
	const result = await runShellDetailed(binary, args, 5000);
	const text = `${result.stdout}\n${result.stderr}`;
	return result.exitCode === 0 && !/not logged in|authentication required|login required/i.test(text);
}

function launchAgentSetup(target: Exclude<AgentConnectTarget, "workbuddy">, kind: ConnectFlowKind): void {
	if (target === "agent-codex") {
		if (isCodexAppInstalled()) openCodexApp();
		else if (kind === "login") openInTerminal("codex login");
		else openCodexApp();
		return;
	}
	if (target === "agent-claude-code") {
		if (kind === "login") openClaudeLoginInTerminal();
		else openInTerminal("npm i -g @anthropic-ai/claude-code && claude --version && claude auth login");
		return;
	}
	if (kind === "login") startCursorBrowserLogin();
	else openCursorAgentInstall();
}

export async function startAgentConnectFlow(
	target: AgentConnectTarget,
	kind: ConnectFlowKind,
): Promise<ConnectFlowStart> {
	const meta = AGENT_META[target];
	const sessionId = randomUUID();

	if (target === "workbuddy") {
		const installed = isWorkBuddyAppInstalled();
		sessions.set(sessionId, {
			target,
			kind: installed ? "login" : "install",
			startedAt: Date.now(),
			isAuthed: async () => {
				tryPersistWorkBuddyBridge();
				return (await probeWorkBuddyGateway({ requireEnabled: false })).available;
			},
		});
		return {
			sessionId,
			target,
			kind: installed ? "login" : "install",
			title: `连接 ${meta.title}`,
			message: installed ? meta.loginMessage : meta.installMessage,
			requiresAction: true,
			actionLabel: installed ? "打开并连接" : "获取 Work Buddy",
		};
	}

	const { binary } = AGENT_CLI[target];
	const installed = await probeAgentCli(binary);
	const effectiveKind = installed ? "login" : "install";
	const codexClientInstalled = target === "agent-codex" && isCodexAppInstalled();
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
		title: installed ? `连接 ${meta.title}` : `获取 ${meta.title}`,
		message: installed ? meta.loginMessage : meta.installMessage,
		requiresAction: true,
		actionLabel: codexClientInstalled
			? "打开 Codex"
			: installed
				? target === "agent-cursor"
					? "在浏览器登录"
					: "继续登录"
				: target === "agent-codex"
					? "获取 Codex"
					: target === "agent-cursor"
						? "获取 Cursor Agent"
						: "开始安装",
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
				error: probe.error ?? "连接超时，请确认 Work Buddy 已登录并保持一个对话打开",
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

export function activateAgentConnectFlow(sessionId: string): { opened: boolean; url?: string } {
	const session = sessions.get(sessionId);
	if (!session) return { opened: false };
	if (session.target === "workbuddy") {
		if (!isWorkBuddyAppInstalled()) return openWorkBuddyApp();
		return activateWorkBuddyPairing(sessionId);
	}
	launchAgentSetup(session.target, session.kind);
	return { opened: true };
}
