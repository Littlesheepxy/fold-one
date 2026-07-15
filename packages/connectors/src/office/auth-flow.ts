import { type ChildProcess, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createNangoConnectLink, probeNango } from "../nango/index.js";
import { probeGmailCli } from "../mail/index.js";
import { extractJsonPayload } from "../cli/binary.js";
import { probeBinary } from "../cli/binary.js";
import { probeLarkCli } from "../feishu/index.js";
import { runShellDetailed } from "../shell.js";
import { type OfficeChannelId, isOfficeChannelId, probeOfficeChannels } from "./index.js";
import {
	cancelAgentConnectFlow,
	isAgentConnectTarget,
	pollAgentConnectFlow,
	startAgentConnectFlow,
	activateWorkBuddyConnectFlow,
	type AgentConnectTarget,
} from "../agents/connect-flow.js";

export type ConnectTarget = OfficeChannelId | "gmail" | "nango" | AgentConnectTarget;

export type ConnectFlowKind = "login" | "install";

export interface ConnectFlowStart {
	sessionId: string;
	target: ConnectTarget;
	kind: ConnectFlowKind;
	title: string;
	message: string;
	authUrl?: string;
	userCode?: string;
	opensBrowserAutomatically?: boolean;
	copyText?: string;
	/** 先复制配对内容，用户确认后再跳转外部应用（WorkBuddy） */
	copyThenOpen?: boolean;
}

export interface ConnectFlowPollResult {
	status: "pending" | "success" | "error";
	message?: string;
	error?: string;
	copyText?: string;
}

interface AuthSession {
	target: ConnectTarget;
	kind: ConnectFlowKind;
	child?: ChildProcess;
	startedAt: number;
	authUrl?: string;
	userCode?: string;
	opensBrowserAutomatically?: boolean;
	isAuthed: () => Promise<boolean>;
}

const sessions = new Map<string, AuthSession>();

const CONNECT_META: Partial<
	Record<ConnectTarget, { title: string; installCmd?: string[]; installUrl?: string }>
> = {
	feishu: { title: "飞书", installCmd: ["npm", "install", "-g", "@larksuite/cli"] },
	github: { title: "GitHub", installCmd: ["brew", "install", "gh"] },
	dingtalk: { title: "钉钉", installCmd: ["npm", "install", "-g", "dingtalk-workspace-cli"] },
	wecom: { title: "企业微信", installCmd: ["npm", "install", "-g", "@wecom/cli"] },
	slack: {
		title: "Slack",
		installUrl: "https://github.com/rockymadden/slack-cli",
	},
	gmail: { title: "Google", installCmd: ["brew", "install", "gogcli"] },
	nango: { title: "托管授权" },
};

function spawnDetached(binary: string, args: string[], env?: NodeJS.ProcessEnv): ChildProcess {
	return spawn(binary, args, {
		detached: false,
		stdio: "ignore",
		env: { ...process.env, ...env },
	});
}

function parseDwsDeviceOutput(text: string): { authUrl?: string; userCode?: string } {
	const url = text.match(/https:\/\/login\.dingtalk\.com\/\S+/)?.[0];
	const code = text.match(/授权码:\s*([A-Z0-9-]+)/)?.[1];
	return { authUrl: url, userCode: code };
}

function parseGhDeviceOutput(text: string): { authUrl?: string; userCode?: string } {
	const url = text.match(/https:\/\/github\.com\/login\/device\S*/)?.[0];
	const code = text.match(/one-time code:\s*([A-Z0-9-]+)/i)?.[1];
	return { authUrl: url, userCode: code };
}

async function startFeishuLogin(session: AuthSession): Promise<ConnectFlowStart> {
	const init = await runShellDetailed(
		"lark-cli",
		["auth", "login", "--no-wait", "--json", "--recommend"],
		20_000,
	);
	const payload = extractJsonPayload(init.stdout) as {
		verification_url?: string;
		device_code?: string;
		error?: { message?: string };
	} | null;
	if (!payload?.verification_url || !payload.device_code) {
		throw new Error(payload?.error?.message ?? "无法启动飞书授权");
	}
	session.authUrl = payload.verification_url;
	session.child = spawnDetached("lark-cli", [
		"auth",
		"login",
		"--device-code",
		payload.device_code,
	]);
	session.isAuthed = async () => (await probeLarkCli()).authed;
	return {
		sessionId: "",
		target: "feishu",
		kind: "login",
		title: "连接飞书",
		message: "在浏览器完成授权后，Fold 会自动检测连接状态。",
		authUrl: payload.verification_url,
	};
}

async function startGithubLogin(session: AuthSession): Promise<ConnectFlowStart> {
	session.child = spawn("gh", ["auth", "login", "--web", "--git-protocol", "https", "-h", "github.com", "-s", "repo,read:org,gist"], {
		env: { ...process.env, GH_PROMPT_DISABLED: "1" },
		stdio: ["ignore", "pipe", "pipe"],
	});
	let output = "";
	session.child.stdout?.on("data", (chunk: Buffer) => {
		output += chunk.toString();
	});
	session.child.stderr?.on("data", (chunk: Buffer) => {
		output += chunk.toString();
	});
	session.opensBrowserAutomatically = true;
	session.isAuthed = async () => {
		const status = await runShellDetailed("gh", ["auth", "status"], 8000);
		return status.exitCode === 0;
	};
	// gh opens browser itself; also expose URL if device flow text appears
	await new Promise((r) => setTimeout(r, 800));
	const parsed = parseGhDeviceOutput(output);
	if (parsed.authUrl) session.authUrl = parsed.authUrl;
	if (parsed.userCode) session.userCode = parsed.userCode;
	return {
		sessionId: "",
		target: "github",
		kind: "login",
		title: "连接 GitHub",
		message: "已在浏览器打开 GitHub 授权页，完成后会自动回到 Fold。",
		authUrl: session.authUrl,
		userCode: session.userCode,
		opensBrowserAutomatically: true,
	};
}

async function startDingtalkLogin(session: AuthSession): Promise<ConnectFlowStart> {
	const child = spawn("dws", ["auth", "login", "--device"], {
		stdio: ["ignore", "pipe", "pipe"],
	});
	session.child = child;
	let output = "";
	child.stdout?.on("data", (chunk: Buffer) => {
		output += chunk.toString();
	});
	child.stderr?.on("data", (chunk: Buffer) => {
		output += chunk.toString();
	});
	await new Promise((r) => setTimeout(r, 1200));
	const parsed = parseDwsDeviceOutput(output);
	session.authUrl = parsed.authUrl;
	session.userCode = parsed.userCode;
	session.isAuthed = async () => {
		const status = await runShellDetailed("dws", ["auth", "status", "--format", "json"], 8000);
		const payload = extractJsonPayload(status.stdout) as { authenticated?: boolean } | null;
		return Boolean(payload?.authenticated);
	};
	return {
		sessionId: "",
		target: "dingtalk",
		kind: "login",
		title: "连接钉钉",
		message: "在浏览器打开钉钉授权页，输入授权码完成连接。",
		authUrl: parsed.authUrl,
		userCode: parsed.userCode,
	};
}

async function startGmailLogin(session: AuthSession): Promise<ConnectFlowStart> {
	session.child = spawnDetached("gog", ["auth", "add"]);
	session.opensBrowserAutomatically = true;
	session.isAuthed = async () => (await probeGmailCli()).available;
	return {
		sessionId: "",
		target: "gmail",
		kind: "login",
		title: "连接 Google",
		message: "已在浏览器打开 Google 授权页，完成后会自动回到 Fold。",
		opensBrowserAutomatically: true,
	};
}

async function startNangoLogin(session: AuthSession): Promise<ConnectFlowStart> {
	const before = (await probeNango()).connections.length;
	const link = await createNangoConnectLink();
	session.authUrl = link;
	session.isAuthed = async () => {
		const probe = await probeNango();
		return probe.connected && probe.connections.length > before;
	};
	return {
		sessionId: "",
		target: "nango",
		kind: "login",
		title: "连接应用",
		message: "在浏览器选择要授权的应用，完成后 Fold 会自动检测。",
		authUrl: link,
	};
}

async function startWecomLogin(session: AuthSession): Promise<ConnectFlowStart> {
	session.child = spawnDetached("wecom-cli", ["init"]);
	session.opensBrowserAutomatically = true;
	session.isAuthed = async () => {
		const status = await runShellDetailed("wecom-cli", ["auth", "show"], 8000);
		const text = (status.stdout + status.stderr).trim();
		return status.exitCode === 0 && !/unauthorized/i.test(text);
	};
	return {
		sessionId: "",
		target: "wecom",
		kind: "login",
		title: "连接企业微信",
		message: "按浏览器提示完成企业微信机器人配置。",
		opensBrowserAutomatically: true,
	};
}

async function startInstall(session: AuthSession, target: ConnectTarget): Promise<ConnectFlowStart> {
	const meta = CONNECT_META[target];
	if (!meta) throw new Error(`未知连接: ${target}`);
	if (!meta.installCmd && meta.installUrl) {
		return {
			sessionId: "",
			target,
			kind: "install",
			title: `安装 ${meta.title}`,
			message: "请按文档安装 CLI，安装完成后点击重新检测。",
			authUrl: meta.installUrl,
		};
	}
	if (!meta.installCmd?.length) throw new Error(`${meta.title} 暂无自动安装方式`);
	const [binary, ...args] = meta.installCmd;
	if (!binary) throw new Error(`${meta.title} 暂无自动安装方式`);
	session.child = spawn(binary, args, { stdio: "ignore" });
	const binaryName =
		target === "feishu"
			? "lark-cli"
			: target === "github"
				? "gh"
				: target === "dingtalk"
					? "dws"
					: target === "wecom"
						? "wecom-cli"
						: target === "gmail"
							? "gog"
							: "";
	session.isAuthed = async () => (binaryName ? await probeBinary(binaryName) : false);
	return {
		sessionId: "",
		target,
		kind: "install",
		title: `安装 ${meta.title}`,
		message: "正在后台安装 CLI，请稍候…",
	};
}

async function startLogin(session: AuthSession, target: ConnectTarget): Promise<ConnectFlowStart> {
	switch (target) {
		case "feishu":
			return startFeishuLogin(session);
		case "github":
			return startGithubLogin(session);
		case "dingtalk":
			return startDingtalkLogin(session);
		case "gmail":
			return startGmailLogin(session);
		case "nango":
			return startNangoLogin(session);
		case "wecom":
			return startWecomLogin(session);
		case "slack":
			throw new Error("Slack CLI 请按文档手动安装后重新检测");
		default:
			throw new Error(`暂不支持可视化连接: ${target}`);
	}
}

/** Start a visual OAuth / device-code connect session (no Terminal). */
export async function startConnectFlow(
	target: ConnectTarget,
	kind: ConnectFlowKind,
): Promise<ConnectFlowStart> {
	if (isAgentConnectTarget(target)) {
		return startAgentConnectFlow(target, kind);
	}

	if (kind === "login" && isOfficeChannelId(target)) {
		const channels = await probeOfficeChannels();
		const row = channels.find((c) => c.id === target);
		if (!row?.installed) {
			return startConnectFlow(target, "install");
		}
	}

	const sessionId = randomUUID();
	const session: AuthSession = {
		target,
		kind,
		startedAt: Date.now(),
		isAuthed: async () => false,
	};
	sessions.set(sessionId, session);

	try {
		const result =
			kind === "install"
				? await startInstall(session, target)
				: await startLogin(session, target);
		return { ...result, sessionId };
	} catch (error) {
		sessions.delete(sessionId);
		throw error;
	}
}

/** Poll connect session until CLI reports authed or child exits with error. */
export async function pollConnectFlow(sessionId: string): Promise<ConnectFlowPollResult> {
	const agentResult = await pollAgentConnectFlow(sessionId);
	if (agentResult) return agentResult;

	const session = sessions.get(sessionId);
	if (!session) return { status: "error", error: "连接会话已过期" };

	if (await session.isAuthed()) {
		sessions.delete(sessionId);
		return { status: "success", message: "已连接" };
	}

	const child = session.child;
	if (child && child.exitCode !== null) {
		if (child.exitCode === 0 && (await session.isAuthed())) {
			sessions.delete(sessionId);
			return { status: "success", message: "已连接" };
		}
		if (child.exitCode !== 0 && !(await session.isAuthed())) {
			sessions.delete(sessionId);
			return { status: "error", error: "授权未完成或已取消" };
		}
	}

	if (Date.now() - session.startedAt > 10 * 60_000) {
		child?.kill();
		sessions.delete(sessionId);
		return { status: "error", error: "授权超时，请重试" };
	}

	return { status: "pending" };
}

export function getConnectFlowSession(sessionId: string): Pick<AuthSession, "authUrl" | "userCode"> | null {
	const session = sessions.get(sessionId);
	if (!session) return null;
	return { authUrl: session.authUrl, userCode: session.userCode };
}

export function cancelConnectFlow(sessionId: string): void {
	cancelAgentConnectFlow(sessionId);
	const session = sessions.get(sessionId);
	if (!session) return;
	session.child?.kill();
	sessions.delete(sessionId);
}

export function resolveConnectTarget(connectionId: string): ConnectTarget | null {
	if (isAgentConnectTarget(connectionId)) return connectionId;
	if (connectionId === "gmail" || connectionId === "nango") return connectionId;
	if (connectionId.startsWith("office-")) {
		const channel = connectionId.slice("office-".length);
		return isOfficeChannelId(channel) ? channel : null;
	}
	return null;
}

export { activateWorkBuddyConnectFlow };
