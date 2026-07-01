import type { ActionPlan } from "@fold/ai";
import {
	probeBrowserCdp,
	probeGmailCli,
	probeScreenCapture,
	type GmailCliProbe,
} from "@fold/connectors";
import type { ProbeRunResult } from "./probe-runner.js";
import type { OrchestratorDeps, UserActionRequest } from "./types.js";
import { mayNeedScreenPermission } from "./visual-intent.js";

function probeValue<T>(probeResult: ProbeRunResult, id: string): T | undefined {
	const probe = probeResult.probes.find((p) => p.id === id);
	if (!probe || probe.status !== "ok") return undefined;
	return probe.value as T;
}

function isGmailIntent(intent: string): boolean {
	return /gmail|谷歌邮箱|google\s*mail/i.test(intent);
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
			title: "等待 Gmail CLI 授权",
			message:
				initial.backend === "gws"
					? "请在终端完成 gws auth setup，完成后点击下方按钮。"
					: "请在终端完成 gog auth add <邮箱>，完成后点击下方按钮。",
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
): Promise<void> {
	const gmailCli = probeValue<GmailCliProbe>(probeResult, "gmail.cli") ?? (await probeGmailCli());
	if (gmailCli.available) return;
	if (!gmailCli.backend) return;

	const choice = await ask(requestUserAction, {
		title: "Gmail CLI 需要授权",
		message: gmailCli.error ?? "gog/gws 已安装但未登录。",
		hint: "CLI 适合：统计未读、搜索邮件主题/发件人，无需打开浏览器。",
		runContext: { backend: gmailCli.backend },
		options: [
			{ id: "gmail:terminal-auth", label: "在终端授权" },
			{ id: "gmail:use-browser", label: "改用浏览器" },
			{ id: "cancel", label: "取消" },
		],
	});

	if (choice === "gmail:use-browser") {
		process.env.FOLD_GMAIL_PREFER_CLI = "0";
		return;
	}

	if (choice === "gmail:terminal-auth") {
		const result = await waitForGmailCliAuth(requestUserAction, gmailCli);
		if (result === "browser") {
			process.env.FOLD_GMAIL_PREFER_CLI = "0";
		}
	}
}

async function ensureGmailBrowserReady(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const cdp = await probeBrowserCdp();
		if (cdp.connected && cdp.mailUrl) return;

		await ask(requestUserAction, {
			title: attempt === 0 ? "Gmail 浏览器登录" : "仍在等待 Gmail 登录",
			message: cdp.connected
				? "Chrome 已连接，但还没有 Gmail 标签页。请登录后点击「已完成」。"
				: "将用浏览器访问 Gmail。请在新窗口登录你的 Google 账号。",
			hint: "浏览器适合：打开收件箱、读页面内容、写草稿。",
			options: [
				{ id: "gmail:open-browser", label: "打开 Gmail" },
				{ id: "gmail:poll-done", label: "已完成登录" },
				{ id: "cancel", label: "取消" },
			],
		});
	}
}

async function ensureScreenCapturePermission(
	requestUserAction: NonNullable<OrchestratorDeps["requestUserAction"]>,
): Promise<void> {
	for (let attempt = 0; attempt < 4; attempt++) {
		const probe = await probeScreenCapture();
		if (probe.available) return;

		await ask(requestUserAction, {
			title: attempt === 0 ? "需要屏幕录制权限" : "仍在等待屏幕录制权限",
			message: probe.error ?? "截屏需要屏幕录制权限。",
			hint: "系统设置 → 隐私与安全性 → 屏幕录制 → 勾选 Fold / Electron / Cursor（取决于你如何启动）",
			options: [
				{ id: "screen:open-settings", label: "打开系统设置" },
				{ id: "screen:poll-done", label: "已完成授权" },
				{ id: "cancel", label: "取消" },
			],
		});
	}

	throw new Error("屏幕录制权限仍未生效，无法截屏");
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
	if (!needsMail && !needsScreen) return;

	if (needsMail) {
		const gmailCli = probeValue<GmailCliProbe>(probeResult, "gmail.cli") ?? (await probeGmailCli());
		const preferCli = process.env.FOLD_GMAIL_PREFER_CLI !== "0";
		const cliInstalled = Boolean(gmailCli.backend);

		if (preferCli && cliInstalled && !gmailCli.available) {
			await ensureGmailCliAuth(probeResult, requestUserAction);
		}

		const userChoseBrowser = process.env.FOLD_GMAIL_PREFER_CLI === "0";
		if ((userChoseBrowser || !cliInstalled) && isGmailIntent(intent)) {
			const cdp = probeValue<{ connected?: boolean; mailUrl?: string | null }>(
				probeResult,
				"browser.cdp",
			);
			if (!cdp?.connected || !cdp.mailUrl) {
				await ensureGmailBrowserReady(requestUserAction);
			}
		}
	}

	if (needsScreen) {
		await ensureScreenCapturePermission(requestUserAction);
	}
}
