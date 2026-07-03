import type { ActionPlan } from "@fold/ai";
import type { ProbeRunResult } from "./probe-runner.js";
import { formatCliVendorMaintenanceHint } from "@fold/connectors";
import {
	isFeishuIntent,
	isGmailIntent,
	isScreenshotIntent,
	wantsMailContent,
} from "./capability-resolver.js";

function probeValue<T>(probeResult: ProbeRunResult, id: string): T | undefined {
	const probe = probeResult.probes.find((p) => p.id === id);
	if (!probe || probe.status !== "ok") return undefined;
	return probe.value as T;
}

function planUsesMail(plan: ActionPlan): boolean {
	return plan.steps.some((s) => s.skill.startsWith("mail."));
}

function planUsesFeishu(plan: ActionPlan): boolean {
	return plan.steps.some((s) => s.skill === "feishu.mail.triage");
}

function planUsesScreenshot(plan: ActionPlan): boolean {
	return plan.steps.some((s) => s.skill === "os.screenshot");
}

export function formatCapabilityBrief(
	intent: string,
	plan: ActionPlan,
	probeResult: ProbeRunResult,
): string {
	const lines: string[] = ["执行路径（CLI vs 浏览器）："];

	if (planUsesMail(plan) || isGmailIntent(intent)) {
		const gmailCli = probeValue<{
			available?: boolean;
			backend?: string;
			account?: string;
			error?: string;
		}>(probeResult, "gmail.cli");
		const cdp = probeValue<{
			connected?: boolean;
			cdpUrl?: string;
			mailUrl?: string | null;
			error?: string;
		}>(probeResult, "browser.cdp");
		const mailPage = probeValue<{ cdpConnected?: boolean; contextUrl?: string | null }>(
			probeResult,
			"browser.mailPage",
		);

		lines.push(
			"",
			"【Gmail · CLI（gog/gws）】",
			"  能做：统计未读、搜索邮件主题/发件人、拉取列表摘要",
			"  需要：终端执行 gog auth add / gws auth setup",
			`  状态：${
				gmailCli?.available
					? `已授权${gmailCli.account ? `（${gmailCli.account}）` : ""} · ${gmailCli.backend}`
					: (gmailCli?.error ?? "未安装或未登录")
			}`,
			"",
			"【Gmail · 浏览器（Chrome CDP）— 兜底】",
			"  能做：打开收件箱、读页面、写草稿（较慢，仅无 CLI 时用）",
			"  需要：Chrome 已登录 Gmail；设置里配置 CDP",
			`  状态：${
				cdp?.connected
					? `CDP 已连接${mailPage?.contextUrl || cdp.mailUrl ? " · 已有邮件页" : ""}`
					: cdp?.cdpUrl
						? `CDP 未连上（${cdp.error ?? "检查 Chrome 远程调试"}）`
						: "未配置（未装 CLI 时会尝试拉起 Chrome）"
			}`,
		);

		const cliInstalled = Boolean(gmailCli?.backend);
		if (wantsMailContent(intent)) {
			lines.push(
				"",
				`推荐：${
					gmailCli?.available
						? "CLI 搜索邮件（gog gmail search / gws gmail +triage）"
						: cliInstalled
							? "先完成 CLI 授权（不走 CDP）"
							: "安装 gog 后走 CLI；否则才用 CDP"
				}`,
			);
		} else {
			lines.push(
				"",
				`推荐：${
					gmailCli?.available
						? "CLI 统计未读"
						: cliInstalled
							? "先完成 CLI 授权"
							: "未装 CLI → CDP 兜底"
				}`,
			);
		}

		lines.push("", "CLI 社区维护（本地可查）：", formatCliVendorMaintenanceHint());
	}

	if (planUsesFeishu(plan) || isFeishuIntent(intent)) {
		const feishu = probeValue<{ available?: boolean; authed?: boolean; error?: string }>(
			probeResult,
			"feishu.available",
		);
		lines.push(
			"",
			"【飞书邮件 · lark-cli】",
			"  能做：检索 / 分拣飞书邮箱",
			"  需要：lark-cli auth login",
			`  状态：${feishu?.authed ? "已登录" : (feishu?.error ?? "未安装或未登录")}`,
		);
	}

	const screen = probeValue<{ available?: boolean; error?: string }>(probeResult, "screen.capture");
	if (planUsesScreenshot(plan) || isScreenshotIntent(intent) || screen) {
		lines.push(
			"",
			"【截屏 · os.screenshot】",
			"  能做：截取前台窗口/全屏；可选智谱 OCR 读文字",
			"  需要：屏幕录制权限；读文字需 ZHIPU_API_KEY",
			`  状态：${screen?.available ? "可用" : (screen?.error ?? "未检测")}`,
			"  顺序：clipboard / CLI / CDP → os.screenshot → gui.uitars（要点按才用）",
		);
	}

	if (lines.length === 1) return "";
	return lines.join("\n");
}
