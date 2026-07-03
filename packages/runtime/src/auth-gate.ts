import type { ActionPlan } from "@fold/ai";
import {
	probeBrowserCdp,
	probeGmailCli,
	probeScreenCapture,
	type GmailCliProbe,
} from "@fold/connectors";
import { isBrowserIntent, isGmailIntent, mayNeedScreenPermission } from "./capability-resolver.js";
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

function planUsesMail(plan: ActionPlan): boolean {
	return plan.steps.some((s) => s.skill.startsWith("mail."));
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

async function waitForGmailCliAuth(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	initial: GmailCliProbe,
): Promise<"cli" | "browser"> {
	for (let attempt = 0; attempt < 12; attempt++) {
		const probe = await probeGmailCli();
		if (probe.available) return "cli";

		const choice = await ask(requestUserAction, {
			title: attempt === 0 ? "Gmail CLI 需要授权" : "等待 Gmail CLI 授权",
			message:
				attempt === 0
					? initial.backend === "gws"
						? "已在终端打开 gws auth setup，请按提示完成登录。"
						: "已在终端打开 gog auth add，请按提示添加邮箱。"
					: initial.backend === "gws"
						? "仍在等待 gws 授权，完成后点击下方按钮。"
						: "仍在等待 gog 授权，完成后点击下方按钮。",
			hint: probe.error ?? initial.error,
			options: [
				{ id: "gmail:poll-done", label: "已完成授权" },
				{ id: "gmail:use-browser", label: "改用浏览器" },
				{ id: "cancel", label: "取消" },
			],
		});
		if (choice === "gmail:use-browser") return "browser";
	}

	throw new Error("Gmail CLI 授权超时，请重试或改用浏览器");
}

async function ensureGmailCliAuth(
	probeResult: ProbeRunResult,
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	runUserAction?: OrchestratorDeps["runUserAction"],
): Promise<void> {
	const gmailCli = probeValue<GmailCliProbe>(probeResult, "gmail.cli") ?? (await probeGmailCli());
	if (gmailCli.available) return;
	if (!gmailCli.backend) return;

	if (runUserAction) {
		await runUserAction("gmail:terminal-auth", { backend: gmailCli.backend });
	}

	const result = await waitForGmailCliAuth(requestUserAction, gmailCli);
	if (result === "browser") {
		process.env.FOLD_GMAIL_PREFER_CLI = "0";
	}
}

async function ensureGmailBrowserReady(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	runUserAction?: OrchestratorDeps["runUserAction"],
): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const cdp = await probeBrowserCdp();
		if (cdp.connected && cdp.mailUrl) return;

		if (attempt === 0 && runUserAction) {
			await runUserAction("gmail:open-browser");
		}

		await ask(requestUserAction, {
			title: attempt === 0 ? "Gmail 浏览器登录" : "仍在等待 Gmail 登录",
			message:
				attempt === 0
					? "已打开 Gmail，请在你正在使用的 Chrome 里登录 Google 账号。"
					: cdp.connected
						? "Chrome 已连接，但还没有 Gmail 标签页。请登录后点击「已完成」。"
						: "请先在 Chrome 登录 Gmail，并确保浏览器已连接。",
			hint: "浏览器适合：打开收件箱、读页面内容、写草稿。",
			options: [
				{ id: "gmail:open-browser", label: "重新打开 Gmail" },
				{ id: "gmail:poll-done", label: "已完成登录" },
				{ id: "cancel", label: "取消" },
			],
		});
	}
}

async function ensureScreenCapturePermission(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
	runUserAction?: OrchestratorDeps["runUserAction"],
): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const probe = await probeScreenCapture();
		if (probe.available) return;

		if (attempt === 0 && runUserAction) {
			await runUserAction("screen:open-settings");
		}

		await ask(requestUserAction, {
			title: attempt === 0 ? "需要屏幕录制权限" : "仍在等待屏幕录制权限",
			message:
				attempt === 0
					? "已打开系统设置，请为 Fold 开启屏幕录制权限。"
					: probe.error ?? "截屏需要屏幕录制权限。",
			hint: "系统设置 → 隐私与安全性 → 屏幕录制 → 勾选 Fold / Electron",
			options: [
				{ id: "screen:open-settings", label: "打开系统设置" },
				{ id: "screen:poll-done", label: "已完成授权" },
				{ id: "cancel", label: "取消" },
			],
		});
	}

	throw new Error("屏幕录制权限仍未生效，无法截屏");
}

async function ensureBrowserReady(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const cdp = await probeBrowserCdp();
		if (cdp.connected) return;

		await ask(requestUserAction, {
			title: attempt === 0 ? "需要连接你的 Chrome" : "仍在等待浏览器连接",
			message:
				attempt === 0
					? "Fold 需要操控你正在使用的 Chrome，不会自动新开浏览器。请选择一种方式完成配置。"
					: (cdp.error ?? "尚未检测到 Chrome 调试通道。"),
			hint: "推荐：安装 Playwright MCP Bridge 并在设置里填入 Token；或在 Chrome 打开 chrome://inspect/#remote-debugging 勾选 Allow remote debugging 后重启 Chrome。",
			options: [
				{ id: "cdp:install-bridge", label: "安装 Playwright Bridge" },
				{ id: "cdp:open-remote-debugging", label: "打开 Chrome 调试设置" },
				{ id: "cdp:poll-done", label: "已完成配置" },
				{ id: "cancel", label: "取消" },
			],
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
	const { requestUserAction } = deps;
	if (!requestUserAction) return;

	const needsMail = planUsesMail(plan) || isGmailIntent(intent);
	const needsScreen = mayNeedScreenPermission(intent, planUsesScreenshot(plan));
	const needsBrowser =
		planUsesBrowser(plan) || (isBrowserIntent(intent) && !isGmailIntent(intent));
	if (!needsMail && !needsScreen && !needsBrowser) return;

	if (needsBrowser) {
		const cdp = probeValue<{ connected?: boolean }>(probeResult, "browser.cdp");
		if (!cdp?.connected) {
			await ensureBrowserReady(requestUserAction);
		}
	}

	if (needsMail) {
		const gmailCli = probeValue<GmailCliProbe>(probeResult, "gmail.cli") ?? (await probeGmailCli());
		const preferCli = process.env.FOLD_GMAIL_PREFER_CLI !== "0";
		const cliInstalled = Boolean(gmailCli.backend);

		if (preferCli && cliInstalled && !gmailCli.available) {
			await ensureGmailCliAuth(probeResult, requestUserAction, deps.runUserAction);
		}

		const userChoseBrowser = process.env.FOLD_GMAIL_PREFER_CLI === "0";
		if ((userChoseBrowser || !cliInstalled) && isGmailIntent(intent)) {
			const cdp = probeValue<{ connected?: boolean; mailUrl?: string | null }>(
				probeResult,
				"browser.cdp",
			);
			if (!cdp?.connected || !cdp.mailUrl) {
				await ensureGmailBrowserReady(requestUserAction, deps.runUserAction);
			}
		}
	}

	if (needsScreen) {
		await ensureScreenCapturePermission(requestUserAction, deps.runUserAction);
	}
}
