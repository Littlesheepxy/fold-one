import type { ActionPlan } from "@fold/ai";
import { labelForStep } from "./step-labels.js";
import type { StepResult } from "./types.js";

type SummaryStep = Pick<StepResult, "skill" | "status" | "output" | "error">;

function isActionIntent(intent: string): boolean {
	return /抓取|链接|写入|同步|创建|新建|发送|导出|上传|多维表格|bitable/i.test(intent);
}

/** 从 JSON 字符串（含截断片段）提取一行用户可见摘要。 */
export function summaryFromJsonPayload(raw: string): string | null {
	try {
		const parsed = JSON.parse(raw) as {
			records?: unknown[];
			data?: { records?: unknown[]; app?: { url?: string; name?: string } };
			links?: unknown[];
			linkCount?: number;
			count?: number;
			pageTitle?: string;
		};
		const records = parsed.records ?? parsed.data?.records;
		if (Array.isArray(records)) return `已写入 ${records.length} 条记录`;
		const app = parsed.data?.app;
		if (app?.url) {
			return app.name ? `已创建飞书表格「${app.name}」· ${app.url}` : `飞书表格：${app.url}`;
		}
		const n = parsed.linkCount ?? parsed.count ?? parsed.links?.length;
		if (typeof n === "number" && n > 0) {
			return parsed.pageTitle ? `已抓取 ${n} 条链接（${parsed.pageTitle}）` : `已抓取 ${n} 条链接`;
		}
	} catch {
		// 库里的旧 summary 常被截断到 200 字，JSON.parse 会失败
	}
	if (/"records"\s*:\s*\[/.test(raw)) {
		const n = (raw.match(/"fields"\s*:/g) ?? []).length;
		if (n > 0) return `已写入 ${n} 条记录`;
	}
	if (/"links"\s*:\s*\[/.test(raw)) {
		const n = (raw.match(/"href"\s*:/g) ?? []).length;
		if (n > 0) return `已抓取 ${n} 条链接`;
	}
	const feishuUrl = raw.match(/https:\/\/[^\s"']+\.feishu\.cn[^\s"']*/)?.[0];
	if (feishuUrl) return `飞书表格：${feishuUrl}`;
	return null;
}

/** 是否为应隐藏/转写的大段原始数据（JSON/HTML/OCR 等）。 */
export function isRawPayloadText(text: string): boolean {
	return looksLikeRawPayload(text);
}

function looksLikeRawPayload(text: string): boolean {
	const t = text.trim();
	if (!t) return false;
	if (t.startsWith("{") || t.startsWith("[") || t.startsWith("<")) return true;
	if (t.includes("page=0,bbox=") || t.includes("<table")) return true;
	return t.length > 280 && /https?:\/\//.test(t);
}

/** 任务卡片/详情里展示的一行执行结果摘要。 */
export function formatEpisodeSummaryDisplay(input: {
	summary?: string | null;
	resultDetail?: string | null;
	intent: string;
	status: string;
}): string {
	const stored = input.summary?.trim() ?? "";
	if (stored && !looksLikeRawPayload(stored)) return stored;

	const fromJson = stored ? summaryFromJsonPayload(stored) : null;
	if (fromJson) return fromJson;

	if (input.resultDetail?.trim()) {
		return input.resultDetail
			.split("\n")
			.map((line) => line.replace(/^•\s*/, "").replace(/\s+/g, " ").trim())
			.filter(Boolean)
			.slice(0, 3)
			.join(" · ");
	}

	return input.status === "success" ? `已完成：${input.intent}` : `部分完成：${input.intent}`;
}

/** 从步骤输出生成用户可见的一行结果摘要（保存 episode + overlay 用）。 */
export function buildUserVisibleSummary(
	intent: string,
	steps: SummaryStep[],
	validationOk = true,
): string {
	const mailAuthFail = steps.find(
		(s) =>
			s.skill.startsWith("mail.") &&
			s.status === "failed" &&
			/未登录|auth add|not logged in/i.test(s.error ?? ""),
	);
	if (mailAuthFail?.error) return mailAuthFail.error;

	const agentStep = steps.find((s) => s.skill === "agent.execute" && s.status === "success");
	const agentOutput = agentStep?.output as { summary?: string; agentId?: string } | undefined;
	if (agentStep && agentOutput?.summary) {
		const summary = agentOutput.summary.trim();
		if (!/no stdin data received|proceeding without it/i.test(summary)) {
			const prefix = agentOutput.agentId ? `${agentOutput.agentId}: ` : "";
			return `${prefix}${summary}`;
		}
	}

	const evalStep = steps.find((s) => s.skill === "browser.evaluate" && s.status === "success");
	const bitableCreateStep = [...steps].reverse().find((s) => {
		if (s.skill !== "office.cli" || s.status !== "success") return false;
		const out = s.output as { ok?: boolean; stdout?: string } | undefined;
		if (!out?.ok) return false;
		try {
			const data = JSON.parse(out.stdout ?? "{}") as { data?: { app?: { url?: string } } };
			return Boolean(data.data?.app?.url);
		} catch {
			return false;
		}
	});
	const bitableWriteStep = [...steps].reverse().find((s) => {
		if (s.skill !== "office.cli" || s.status !== "success") return false;
		const out = s.output as { ok?: boolean; stdout?: string } | undefined;
		if (!out?.ok) return false;
		try {
			const data = JSON.parse(out.stdout ?? "{}") as { data?: { records?: unknown[] } };
			return Array.isArray(data.data?.records);
		} catch {
			return false;
		}
	});

	if (evalStep || bitableCreateStep || bitableWriteStep) {
		let linkCount = 0;
		let pageTitle = "";
		const rawVal = (evalStep?.output as { value?: unknown } | undefined)?.value;
		if (rawVal != null) {
			try {
				const parsed =
					typeof rawVal === "string"
						? (JSON.parse(rawVal) as {
								count?: number;
								linkCount?: number;
								links?: unknown[];
								pageTitle?: string;
							})
						: (rawVal as {
								count?: number;
								linkCount?: number;
								links?: unknown[];
								pageTitle?: string;
							});
				linkCount = parsed.linkCount ?? parsed.count ?? parsed.links?.length ?? 0;
				pageTitle = parsed.pageTitle ?? "";
			} catch {
				// ignore
			}
		}
		let tableUrl = "";
		let tableName = "";
		let writtenCount = 0;
		if (bitableCreateStep) {
			try {
				const data = JSON.parse(
					(bitableCreateStep.output as { stdout?: string }).stdout ?? "{}",
				) as { data?: { app?: { url?: string; name?: string } } };
				tableUrl = data.data?.app?.url ?? "";
				tableName = data.data?.app?.name ?? "";
			} catch {
				// ignore
			}
		}
		if (bitableWriteStep) {
			try {
				const data = JSON.parse(
					(bitableWriteStep.output as { stdout?: string }).stdout ?? "{}",
				) as { data?: { records?: unknown[] } };
				writtenCount = data.data?.records?.length ?? 0;
			} catch {
				// ignore
			}
		}
		const parts: string[] = [];
		if (linkCount > 0) parts.push(`已抓取 ${linkCount} 条链接`);
		else if (writtenCount > 0) parts.push(`已写入 ${writtenCount} 条记录`);
		if (pageTitle) parts.push(`来源：${pageTitle}`);
		if (tableName || tableUrl) {
			parts.push(tableUrl ? `飞书表格：${tableUrl}` : `已创建飞书表格「${tableName}」`);
		}
		if (parts.length > 0) return parts.join(" · ");
	}

	const mailStep = steps.find((s) => s.skill === "mail.draft");
	const unreadStep = steps.find((s) => s.skill === "mail.countUnread" && s.status === "success");
	const pdfStep = steps.find((s) => s.skill === "pdf.extract");
	const shellStep = steps.find(
		(s) =>
			s.skill === "os.shell" &&
			s.status === "success" &&
			(s.output as { exitCode?: number } | undefined)?.exitCode === 0,
	);
	const pythonStep = steps.find(
		(s) =>
			s.skill === "os.python" &&
			s.status === "success" &&
			(s.output as { exitCode?: number } | undefined)?.exitCode === 0,
	);
	const screenshotStep = steps.find((s) => s.skill === "os.screenshot" && s.status === "success");
	const browserPage = steps.find((s) => s.skill === "browser.currentPage" && s.status === "success");
	const browserOutput = browserPage?.output as { url?: string; title?: string } | undefined;

	const fields = pdfStep?.output as Record<string, unknown> | undefined;
	const fieldCount = fields ? Object.keys(fields).filter((k) => fields[k]).length : 0;
	const unreadOutput = unreadStep?.output as { count?: number } | undefined;
	const shellOutput = shellStep?.output as { stdout?: string } | undefined;
	const screenshotOutput = screenshotStep?.output as { text?: string; path?: string } | undefined;
	const stdout = shellOutput?.stdout?.trim();
	const lineCount = stdout ? stdout.split(/\r?\n/).filter(Boolean).length : 0;
	const wantsCount = /(多少|几个|count)/i.test(intent);

	if (mailStep) {
		return fieldCount > 0 ? `已创建邮件草稿，提取了 ${fieldCount} 个字段` : "已创建邮件草稿";
	}
	if (unreadStep) return `当前有 ${unreadOutput?.count ?? 0} 封待处理邮件`;
	if (shellStep) {
		if (wantsCount) return `已找到 ${lineCount} 条结果`;
		if (stdout) return lineCount > 1 ? `已找到 ${lineCount} 条结果` : `结果：${stdout.slice(0, 120)}`;
		return "命令执行完成";
	}

	const pythonStdout = (pythonStep?.output as { stdout?: string } | undefined)?.stdout?.trim();
	if (pythonStdout) {
		const fromJson =
			pythonStdout.startsWith("{") || pythonStdout.startsWith("[")
				? summaryFromJsonPayload(pythonStdout)
				: null;
		if (fromJson) return fromJson;
		if (!pythonStdout.startsWith("{") && !pythonStdout.startsWith("[")) {
			return pythonStdout.split(/\r?\n/).slice(0, 3).join(" ").slice(0, 200);
		}
	}

	if (screenshotStep && !isActionIntent(intent)) {
		const text = screenshotOutput?.text?.trim();
		if (text) return text.split(/\r?\n/).slice(0, 3).join(" ").slice(0, 200);
		return `已截取屏幕${screenshotOutput?.path ? `：${screenshotOutput.path}` : ""}`;
	}

	if (browserOutput?.url && !isActionIntent(intent)) {
		return browserOutput.title
			? `当前页面：${browserOutput.title}（${browserOutput.url}）`
			: `当前页面：${browserOutput.url}`;
	}

	const detail = buildResultDetail(intent, steps);
	if (detail && detail !== `已完成你的请求：${intent}`) {
		return formatEpisodeSummaryDisplay({
			summary: null,
			resultDetail: detail,
			intent,
			status: validationOk ? "success" : "partial",
		});
	}

	return validationOk ? `已完成：${intent}` : `部分完成：${intent}`;
}

export function formatThinkingText(
	intent: string,
	plan: ActionPlan,
	probeSummary?: string,
): string {
	const lines = [
		`用户意图：${intent}`,
		`计划目标：${plan.goal}`,
		"",
		"将执行以下步骤：",
		...plan.steps.map((step, index) =>
			`${index + 1}. ${labelForStep(step.skill, { args: step.args })}`,
		),
	];
	const probe = probeSummary?.trim();
	if (probe) {
		lines.push("", "环境探测（摘要）：", ...probe.split("\n").slice(0, 8));
	}
	return lines.join("\n");
}

export function buildResultDetail(
	intent: string,
	steps: Array<Pick<StepResult, "skill" | "status" | "output" | "error">>,
): string {
	const lines: string[] = [];

	for (const step of steps) {
		const name = labelForStep(step.skill, { output: step.output });
		if (step.status === "failed") {
			lines.push(`• ${name}：失败${step.error ? `（${step.error}）` : ""}`);
			continue;
		}

		const output = step.output;
		if (step.skill === "browser.evaluate" && output && typeof output === "object") {
			const val = (output as { value?: unknown; targetUrl?: string }).value;
			let linkCount = 0;
			let pageTitle = "";
			if (val != null) {
				try {
					const parsed =
						typeof val === "string"
							? (JSON.parse(val) as { links?: unknown[]; linkCount?: number; count?: number; pageTitle?: string })
							: (val as { links?: unknown[]; linkCount?: number; count?: number; pageTitle?: string });
					linkCount = parsed.linkCount ?? parsed.count ?? parsed.links?.length ?? 0;
					pageTitle = parsed.pageTitle ?? "";
				} catch {
					// ignore
				}
			}
			if (linkCount > 0) {
				lines.push(`• ${name}：抓取 ${linkCount} 条链接${pageTitle ? `（${pageTitle}）` : ""}`);
			} else {
				lines.push(`• ${name}：完成`);
			}
			continue;
		}
		if (step.skill === "office.cli" && output && typeof output === "object") {
			const cli = output as { ok?: boolean; channel?: string; stdout?: string };
			if (cli.ok && cli.stdout) {
				try {
					const data = JSON.parse(cli.stdout) as {
						data?: { app?: { name?: string; url?: string }; records?: unknown[] };
					};
					if (data.data?.app?.url) {
						lines.push(
							`• ${name}：已创建「${data.data.app.name ?? "多维表格"}」${data.data.app.url ? `\n  ${data.data.app.url}` : ""}`,
						);
						continue;
					}
					if (Array.isArray(data.data?.records)) {
						lines.push(`• ${name}：写入 ${data.data.records.length} 条记录`);
						continue;
					}
				} catch {
					// ignore
				}
			}
			lines.push(`• ${name}：${cli.ok ? "完成" : "失败"}`);
			continue;
		}
		if (step.skill === "mail.countUnread" && output && typeof output === "object") {
			const mail = output as { count?: number; provider?: string; backend?: string };
			const via = mail.backend ? `，via ${mail.backend}` : "";
			const provider = mail.provider ? `（${mail.provider}${via}）` : "";
			lines.push(`• ${name}：共 ${mail.count ?? 0} 封未读${provider}`);
			continue;
		}
		if (step.skill === "mail.draft" && output && typeof output === "object") {
			const draft = output as { to?: string; subject?: string; provider?: string };
			lines.push(
				`• ${name}：草稿已创建${draft.to ? `，收件人 ${draft.to}` : ""}${draft.subject ? `，主题「${draft.subject}」` : ""}`,
			);
			continue;
		}
		if (step.skill === "pdf.extract" && output && typeof output === "object") {
			const fields = Object.entries(output as Record<string, unknown>)
				.filter(([, value]) => value != null && String(value).trim())
				.slice(0, 4)
				.map(([key, value]) => `${key}=${String(value).slice(0, 40)}`);
			lines.push(`• ${name}：${fields.length ? fields.join("；") : "已提取字段"}`);
			continue;
		}
		if (step.skill === "os.shell" && output && typeof output === "object") {
			const stdout = (output as { stdout?: string }).stdout?.trim();
			if (stdout) {
				const preview = stdout.split(/\r?\n/).slice(0, 3).join(" / ");
				lines.push(`• ${name}：${preview.slice(0, 160)}`);
				continue;
			}
		}
		if (step.skill === "agent.execute" && output && typeof output === "object") {
			const summary = (output as { summary?: string }).summary?.trim();
			if (summary) {
				lines.push(`• ${name}：${summary.slice(0, 200)}`);
				continue;
			}
		}
		if (step.skill === "os.screenshot" && output && typeof output === "object") {
			const shot = output as { path?: string; text?: string; target?: string };
			if (shot.text?.trim()) {
				const preview = shot.text.trim().split(/\r?\n/).slice(0, 4).join(" / ");
				lines.push(`• ${name}：${preview.slice(0, 200)}`);
			} else {
				lines.push(`• ${name}：已保存 ${shot.path ?? "截图"}（${shot.target ?? "frontmost"}）`);
			}
			continue;
		}

		lines.push(`• ${name}：完成`);
	}

	if (!lines.length) {
		return intent ? `已完成你的请求：${intent}` : "任务已完成。";
	}

	return lines.join("\n");
}
