import type { ActionPlan } from "@fold/ai";
import {
	probeBrowserCdp,
	probeGmailCli,
	probeScreenCapture,
	resolveMailConnector,
	type GmailCliProbe,
} from "@fold/connectors";
import { rankOfficeChannels } from "@fold/memory";
import {
	isGmailIntent,
	mayNeedScreenPermission,
	resolveSendChannel,
	type OfficeChannelHint,
} from "./capability-resolver.js";
import type { ProbeRunResult } from "./probe-runner.js";
import type { OrchestratorDeps, UserActionRequest } from "./types.js";

function probeValue<T>(probeResult: ProbeRunResult, id: string): T | undefined {
	const probe = probeResult.probes.find((p) => p.id === id);
	if (!probe || probe.status !== "ok") return undefined;
	return probe.value as T;
}

function planUsesBrowser(plan: ActionPlan): boolean {
	return plan.steps.some((s) => s.skill.startsWith("browser."));
}

function planUsesScreenshot(plan: ActionPlan): boolean {
	return plan.steps.some((s) => s.skill === "os.screenshot");
}

async function ask(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	req: UserActionRequest,
): Promise<string> {
	const choice = await requestUserAction(req);
	if (choice === "cancel") throw new Error("用户取消了授权");
	return choice;
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
	return new Promise((resolve, reject) => {
		if (signal.aborted) {
			reject(new Error("aborted"));
			return;
		}
		const timer = setTimeout(resolve, ms);
		signal.addEventListener(
			"abort",
			() => {
				clearTimeout(timer);
				reject(new Error("aborted"));
			},
			{ once: true },
		);
	});
}

/**
 * Show HITL once, poll readiness in background; auto-resolve when ready.
 * User can still click cancel / alternate options anytime.
 */
export async function waitWithAutoPoll(opts: {
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>;
	resolveUserAction?: OrchestratorDeps["resolveUserAction"];
	req: UserActionRequest;
	isReady: () => Promise<boolean>;
	readyOptionId: string;
	intervalMs?: number;
	timeoutMs?: number;
}): Promise<string> {
	const intervalMs = opts.intervalMs ?? 2_000;
	const timeoutMs = opts.timeoutMs ?? 120_000;
	const ac = new AbortController();

	const poll = (async () => {
		const deadline = Date.now() + timeoutMs;
		const tick = async () => {
			if (ac.signal.aborted) return true;
			try {
				if (await opts.isReady()) {
					opts.resolveUserAction?.(opts.readyOptionId);
					return true;
				}
			} catch {
				/* keep polling */
			}
			return false;
		};
		if (await tick()) return;
		while (Date.now() < deadline) {
			try {
				await sleep(intervalMs, ac.signal);
			} catch {
				return;
			}
			if (await tick()) return;
		}
	})();

	try {
		return await ask(opts.requestUserAction, opts.req);
	} finally {
		ac.abort();
		await poll.catch(() => undefined);
	}
}

async function waitForGmailCliAuth(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	resolveUserAction: OrchestratorDeps["resolveUserAction"],
	initial: GmailCliProbe,
): Promise<"cli" | "browser"> {
	const choice = await waitWithAutoPoll({
		requestUserAction,
		resolveUserAction,
		readyOptionId: "gmail:poll-done",
		isReady: async () => (await probeGmailCli()).available,
		timeoutMs: 180_000,
		req: {
			title: "Gmail CLI 需要授权",
			message:
				initial.backend === "gws"
					? "已在终端打开 gws auth setup。完成后会自动继续，也可改用浏览器。"
					: "已在终端打开 gog auth add。完成后会自动继续，也可改用浏览器。",
			hint: initial.error ?? "完成后会自动继续",
			risk: "sensitive",
			options: [
				{ id: "gmail:poll-done", label: "已完成授权" },
				{ id: "gmail:use-browser", label: "改用浏览器" },
				{ id: "cancel", label: "取消" },
			],
		},
	});
	if (choice === "gmail:use-browser") return "browser";
	if (!(await probeGmailCli()).available && choice === "gmail:poll-done") {
		throw new Error("Gmail CLI 尚未授权完成，请重试或改用浏览器");
	}
	return "cli";
}

async function ensureGmailCliAuth(
	probeResult: ProbeRunResult,
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	resolveUserAction: OrchestratorDeps["resolveUserAction"],
	runUserAction?: OrchestratorDeps["runUserAction"],
): Promise<void> {
	const gmailCli = probeValue<GmailCliProbe>(probeResult, "gmail.cli") ?? (await probeGmailCli());
	if (gmailCli.available) return;
	if (!gmailCli.backend) return;

	if (runUserAction) {
		await runUserAction("gmail:terminal-auth", { backend: gmailCli.backend });
	}

	const result = await waitForGmailCliAuth(requestUserAction, resolveUserAction, gmailCli);
	if (result === "browser") {
		process.env.FOLD_GMAIL_PREFER_CLI = "0";
	}
}

async function ensureGmailBrowserReady(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	resolveUserAction: OrchestratorDeps["resolveUserAction"],
	runUserAction?: OrchestratorDeps["runUserAction"],
): Promise<void> {
	if (runUserAction) {
		await runUserAction("gmail:open-browser");
	}

	for (let attempt = 0; attempt < 4; attempt++) {
		const ready = await probeBrowserCdp();
		if (ready.connected && ready.mailUrl) return;

		const choice = await waitWithAutoPoll({
			requestUserAction,
			resolveUserAction,
			readyOptionId: "gmail:poll-done",
			isReady: async () => {
				const cdp = await probeBrowserCdp();
				return Boolean(cdp.connected && cdp.mailUrl);
			},
			timeoutMs: 90_000,
			req: {
				title: attempt === 0 ? "Gmail 浏览器登录" : "仍在等待 Gmail 登录",
				message:
					attempt === 0
						? "已打开 Gmail，请在 Chrome 里登录 Google 账号。完成后会自动继续。"
						: "还没检测到已登录的 Gmail 标签页。完成后会自动继续。",
				hint: "也可点「重新打开 Gmail」或「已完成登录」。",
				risk: "sensitive",
				options: [
					{ id: "gmail:open-browser", label: "重新打开 Gmail" },
					{ id: "gmail:poll-done", label: "已完成登录" },
					{ id: "cancel", label: "取消" },
				],
			},
		});

		if (choice === "gmail:open-browser" && runUserAction) {
			await runUserAction("gmail:open-browser");
		}
	}
}

async function ensureScreenCapturePermission(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	resolveUserAction: OrchestratorDeps["resolveUserAction"],
	runUserAction?: OrchestratorDeps["runUserAction"],
): Promise<void> {
	if (runUserAction) {
		await runUserAction("screen:open-settings");
	}

	for (let attempt = 0; attempt < 4; attempt++) {
		if ((await probeScreenCapture()).available) return;

		const choice = await waitWithAutoPoll({
			requestUserAction,
			resolveUserAction,
			readyOptionId: "screen:poll-done",
			isReady: async () => (await probeScreenCapture()).available,
			timeoutMs: 90_000,
			req: {
				title: attempt === 0 ? "需要屏幕录制权限" : "仍在等待屏幕录制权限",
				message:
					attempt === 0
						? "已打开系统设置，请为 Fold 开启屏幕录制。完成后会自动继续。"
						: "权限尚未生效。开启后会自动继续。",
				hint: "系统设置 → 隐私与安全性 → 屏幕录制 → 勾选 Fold / Electron",
				risk: "sensitive",
				options: [
					{ id: "screen:open-settings", label: "打开系统设置" },
					{ id: "screen:poll-done", label: "已完成授权" },
					{ id: "cancel", label: "取消" },
				],
			},
		});

		if (choice === "screen:open-settings" && runUserAction) {
			await runUserAction("screen:open-settings");
		}
	}

	throw new Error("屏幕录制权限仍未生效，无法截屏");
}

async function ensureBrowserReady(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	resolveUserAction: OrchestratorDeps["resolveUserAction"],
): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt++) {
		if ((await probeBrowserCdp()).connected) return;

		await waitWithAutoPoll({
			requestUserAction,
			resolveUserAction,
			readyOptionId: "cdp:poll-done",
			isReady: async () => (await probeBrowserCdp()).connected,
			timeoutMs: 90_000,
			req: {
				title: attempt === 0 ? "需要连接你的 Chrome" : "仍在等待浏览器连接",
				message:
					attempt === 0
						? "Fold 需要操控你正在使用的 Chrome。完成 Bridge 或远程调试配置后会自动继续。"
						: "尚未检测到 Chrome 调试通道。配置完成后会自动继续。",
				hint: "推荐：安装 Playwright MCP Bridge；或 chrome://inspect/#remote-debugging 勾选 Allow remote debugging 后重启 Chrome。",
				risk: "sensitive",
				options: [
					{ id: "cdp:install-bridge", label: "安装 Playwright Bridge" },
					{ id: "cdp:open-remote-debugging", label: "打开 Chrome 调试设置" },
					{ id: "cdp:poll-done", label: "已完成配置" },
					{ id: "cancel", label: "取消" },
				],
			},
		});
	}

	throw new Error("浏览器仍未连接，请完成配置后重试");
}

/**
 * Pause execution and guide the user through CLI / browser auth when needed.
 */
export async function ensureExecutionPrerequisites(
	intent: string,
	plan: ActionPlan,
	probeResult: ProbeRunResult,
	deps: OrchestratorDeps,
): Promise<void> {
	const { requestUserAction, resolveUserAction } = deps;
	if (!requestUserAction) return;

	const mailProvider = process.env.FOLD_MAIL_PROVIDER ?? "auto";
	const officeChannels = probeValue<OfficeChannelHint[]>(probeResult, "office.channels");
	const officeOrder = rankOfficeChannels(["feishu", "dingtalk", "wecom"], deps.dataDir);
	const sendChannel = resolveSendChannel(intent, officeChannels, mailProvider, officeOrder);
	const mailConnector = resolveMailConnector(undefined, {
		intent,
		activeApp: undefined,
		activeWindow: undefined,
		recentUrls: [],
	});
	const needsGmailAuth =
		sendChannel === "mail" &&
		mailProvider !== "file" &&
		mailProvider !== "apple-mail" &&
		(mailConnector.startsWith("gmail") || isGmailIntent(intent) || mailProvider.startsWith("gmail"));

	const needsScreen = mayNeedScreenPermission(intent, planUsesScreenshot(plan));
	// Gate on the plan, not intent hints — 「多维表格」等词会命中 isBrowserIntent，
	// 但 office.cli 路径不需要 Chrome CDP。
	const needsBrowser = planUsesBrowser(plan);
	if (!needsGmailAuth && !needsScreen && !needsBrowser) return;

	if (needsBrowser) {
		const cdp = probeValue<{ connected?: boolean }>(probeResult, "browser.cdp");
		if (!cdp?.connected) {
			await ensureBrowserReady(requestUserAction, resolveUserAction);
		}
	}

	if (needsGmailAuth) {
		const gmailCli = probeValue<GmailCliProbe>(probeResult, "gmail.cli") ?? (await probeGmailCli());
		const preferCli = process.env.FOLD_GMAIL_PREFER_CLI !== "0";
		const cliInstalled = Boolean(gmailCli.backend);

		if (preferCli && cliInstalled && !gmailCli.available) {
			await ensureGmailCliAuth(
				probeResult,
				requestUserAction,
				resolveUserAction,
				deps.runUserAction,
			);
		}

		const userChoseBrowser = process.env.FOLD_GMAIL_PREFER_CLI === "0";
		if ((userChoseBrowser || !cliInstalled) && isGmailIntent(intent)) {
			const cdp = probeValue<{ connected?: boolean; mailUrl?: string | null }>(
				probeResult,
				"browser.cdp",
			);
			if (!cdp?.connected || !cdp.mailUrl) {
				await ensureGmailBrowserReady(requestUserAction, resolveUserAction, deps.runUserAction);
			}
		}
	}

	if (needsScreen) {
		await ensureScreenCapturePermission(
			requestUserAction,
			resolveUserAction,
			deps.runUserAction,
		);
	}
}
