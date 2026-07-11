import {
	clipboardRead,
	clipboardRecall,
	finderLatestDownload,
	mailCountUnread,
	mailDraft,
	mailOpen,
	pdfExtract,
} from "./builtin/index.js";
import * as agentSkill from "./builtin/agent.js";
import { browserCurrentPage, browserEvaluateSkill, browserInteractSkill } from "./builtin/browser.js";
import { feishuMailTriage } from "./builtin/feishu.js";
import { guiUitars } from "./builtin/gui.js";
import { officeCli } from "./builtin/office.js";
import { pluginCli, pluginScout } from "./builtin/plugin.js";
import { slackUnread } from "./builtin/slack.js";
import { workbuddyRun } from "./builtin/workbuddy.js";
import { osAppleScript, osPython, osShell } from "./builtin/os-runtime.js";
import { osScreenshot } from "./builtin/screenshot.js";
import { loadPluginManifests } from "@fold/connectors";
import type { SkillContext, SkillDefinition, SkillStepView, SkillValidator } from "./types.js";

function findStep(results: SkillStepView[], skill: string): SkillStepView | undefined {
	return results.find((r) => r.skill === skill);
}

/** exitOk 类规则须对计划中每一个同 skill 步骤生效，防止"第一步成功、后续失败"漏报。 */
function everyStepOk(
	results: SkillStepView[],
	skill: string,
	check: (step: SkillStepView) => boolean,
): boolean {
	const steps = results.filter((r) => r.skill === skill);
	return steps.length > 0 && steps.every(check);
}

const REGISTRY: SkillDefinition[] = [
	{
		id: "finder.latestDownload",
		handler: finderLatestDownload,
		label: "查找最近下载",
		catalogDoc: "finder.latestDownload: { ext?: string, since?: string } -> { path, name, size }",
	},
	{
		id: "pdf.extract",
		handler: pdfExtract,
		label: "读取 PDF",
		catalogDoc:
			"pdf.extract: { path: string, fields?: string[] } -> { vendor?, amount?, date?, rawText? }",
		validators: {
			"pdf.fields.nonEmpty": (results) => {
				const pdf = findStep(results, "pdf.extract");
				if (!pdf?.output || typeof pdf.output !== "object") return false;
				const o = pdf.output as Record<string, unknown>;
				return Object.values(o).some((v) => v != null && String(v).trim() !== "");
			},
		},
	},
	{
		id: "mail.open",
		handler: mailOpen,
		label: "打开邮件",
		catalogDoc: "mail.open: {} -> { provider, opened }",
	},
	{
		id: "mail.countUnread",
		handler: mailCountUnread,
		label: "统计未读邮件",
		catalogDoc:
			"mail.countUnread: {} -> { provider, count, backend? } (prefers gog/gws CLI over browser CDP)",
		validators: {
			"mail.unread.counted": (results) => {
				const mail = findStep(results, "mail.countUnread");
				const output = mail?.output as { count?: number } | undefined;
				return mail?.status === "success" && typeof output?.count === "number";
			},
		},
	},
	{
		id: "mail.draft",
		handler: mailDraft,
		label: "创建邮件草稿",
		catalogDoc:
			"mail.draft: { to: string, subject?: string, body: string, template?: string } -> { subject, to }",
		validators: {
			"mail.draft.exists": (results) => findStep(results, "mail.draft")?.status === "success",
		},
	},
	{
		id: "clipboard.read",
		handler: clipboardRead,
		label: "读取剪贴板",
		catalogDoc: "clipboard.read: {} -> { text }",
	},
	{
		id: "clipboard.recall",
		handler: clipboardRecall,
		label: "找回复制记录",
		catalogDoc: "clipboard.recall: { query: string } -> { ok, summary, text?, entry? }",
		validators: {
			"clipboard.recall.ok": (results) => {
				const step = findStep(results, "clipboard.recall");
				const output = step?.output as { ok?: boolean } | undefined;
				return step?.status === "success" && output?.ok === true;
			},
		},
	},
	{
		id: "browser.currentPage",
		handler: browserCurrentPage,
		label: "读取浏览器页面",
		catalogDoc:
			"browser.currentPage: {} -> { url, title, selectedText?, pages[], cdpUrl?, connected }",
		validators: {
			"browser.page.ready": (results) => {
				const page = findStep(results, "browser.currentPage");
				const output = page?.output as { url?: string } | undefined;
				return page?.status === "success" && Boolean(output?.url);
			},
		},
	},
	{
		id: "browser.evaluate",
		handler: browserEvaluateSkill,
		label: "浏览器执行 JS",
		catalogDoc: [
			'browser.evaluate: { code: string, url?: string, urlPattern?: string } -> { value, mode, targetUrl } (runs JS in the user\'s real Chrome, login state preserved)',
			'  code must be a function expression, e.g. "() => JSON.stringify([...document.querySelectorAll(\'a[href]\')].map(a => ({text: a.innerText.trim(), href: a.href})))".',
			"  Return JSON-serializable data (stringify complex values). Target page: url (navigate) > urlPattern (regex matched against the user's open tabs, e.g. \"baidu\") > the tab the user is looking at.",
			'  When the user refers to a specific open page (e.g. 百度页面), pass urlPattern like "baidu" instead of guessing a url.',
			"  Prefer this over os.applescript for reading/scraping web pages.",
		].join("\n"),
		validators: {
			"browser.evaluate.ok": (results) =>
				everyStepOk(
					results,
					"browser.evaluate",
					(s) =>
						s.status === "success" &&
						(s.output as { value?: unknown } | undefined)?.value !== undefined,
				),
		},
	},
	{
		id: "browser.interact",
		handler: browserInteractSkill,
		label: "浏览器操作",
		catalogDoc:
			'browser.interact: { action: "goto"|"click"|"fill", url?, selector?, value? } -> { ok, url, title, action }',
		validators: {
			"browser.interact.ok": (results) => {
				const interact = findStep(results, "browser.interact");
				const output = interact?.output as { ok?: boolean } | undefined;
				return interact?.status === "success" && output?.ok === true;
			},
		},
	},
	{
		id: "agent.execute",
		handler: agentSkill.agentExecute,
		label: "本地 Agent 子任务",
		catalogDoc:
			'agent.execute: { brief: string, agent?: "auto"|"claude-code"|"codex"|"cursor", cwd?: string, allowEdits?: boolean } -> { ok, agentId, summary, exitCode, handoff? }',
		validators: {
			"agent.exitOk": (results) => {
				const agent = findStep(results, "agent.execute");
				const output = agent?.output as { ok?: boolean } | undefined;
				return agent?.status === "success" && output?.ok === true;
			},
		},
	},
	{
		id: "gui.uitars",
		handler: guiUitars,
		label: "UI-TARS 界面修复",
		catalogDoc:
			"gui.uitars: { goal: string, budget?: number } -> { ok, summary, stepsUsed } (requires FOLD_ALLOW_UITARS=1 + VLM API key)",
		validators: {
			"gui.uitars.ok": (results) => {
				const step = findStep(results, "gui.uitars");
				const output = step?.output as { ok?: boolean } | undefined;
				return step?.status === "success" && output?.ok === true;
			},
		},
	},
	{
		id: "workbuddy.run",
		handler: workbuddyRun,
		label: "Work Buddy 工作流",
		catalogDoc:
			"workbuddy.run: { query: string, capability?: string } -> { ok, summary } (Work Buddy MCP gateway; search then auto-run best match)",
		validators: {
			"workbuddy.run.ok": (results) => {
				const step = findStep(results, "workbuddy.run");
				const output = step?.output as { ok?: boolean } | undefined;
				return step?.status === "success" && output?.ok === true;
			},
		},
	},
	{
		id: "feishu.mail.triage",
		handler: feishuMailTriage,
		label: "飞书邮件检索",
		catalogDoc:
			"feishu.mail.triage: { query?: string, max?: number } -> { ok, count, summary } (requires lark-cli)",
	},
	{
		id: "slack.unread",
		handler: slackUnread,
		label: "Slack 未读消息",
		catalogDoc:
			"slack.unread: { limit?: number } -> { ok, count, summary } (requires slack-cli or slk)",
	},
	{
		id: "office.cli",
		handler: officeCli,
		label: "办公软件 CLI",
		catalogDoc: [
			'office.cli: { channel: "feishu"|"github"|"dingtalk"|"wecom"|"slack", args: string[] } -> { ok, stdout, stderr, exitCode }',
			"  Runs the channel's official CLI in execFile mode (no shell/pipes). Channel binaries: feishu=lark-cli, github=gh, dingtalk=dws, wecom=wecom-cli.",
			"  Feishu covers bitable(base)/docs/sheets/calendar/im/drive/wiki. Prefer the generic api form (path params inline, body via --data):",
			'    新建多维表格: args ["api","POST","/open-apis/bitable/v1/apps","--data","{\\"name\\":\\"...\\"}"] -> stdout data.app.app_token + data.app.default_table_id + data.app.url',
			'    批量插记录: args ["api","POST","/open-apis/bitable/v1/apps/<app_token>/tables/<table_id>/records/batch_create","--data","{\\"records\\":[{\\"fields\\":{...}}]}"]',
			'    查参数: args ["schema","<service.resource.method>"]',
			"  钉钉(dws)覆盖 AI表格/日历/文档/待办/审批; 企业微信(wecom-cli)覆盖 文档/智能表格/日程/待办/消息。加 --format json 获取可解析输出。",
		].join("\n"),
		validators: {
			"office.cli.exitOk": (results) =>
				everyStepOk(
					results,
					"office.cli",
					(s) => s.status === "success" && (s.output as { ok?: boolean } | undefined)?.ok === true,
				),
		},
	},
	{
		id: "plugin.cli",
		handler: pluginCli,
		label: "扩展插件 CLI",
		catalogDoc: [
			"plugin.cli: { plugin: string, args: string[] } -> { ok, stdout, stderr, exitCode }",
			'  Runs a user-installed plugin CLI in execFile mode. Only use plugin ids listed under "Installed plugins" below.',
		].join("\n"),
		validators: {
			"plugin.cli.exitOk": (results) =>
				everyStepOk(
					results,
					"plugin.cli",
					(s) => s.status === "success" && (s.output as { ok?: boolean } | undefined)?.ok === true,
				),
		},
	},
	{
		id: "plugin.scout",
		handler: pluginScout,
		label: "插件接入调研",
		catalogDoc: [
			"plugin.scout: { service: string, hint?: string } -> { ok, pluginId, installed, authed, install?, login? }",
			"  Researches a service's official CLI via local agent subagent and registers it as a reusable plugin manifest.",
			"  Use only when the user asks to integrate a service that has no catalog skill and no installed plugin. Slow (up to 5 min).",
		].join("\n"),
		validators: {
			"plugin.scout.ok": (results) => {
				const step = findStep(results, "plugin.scout");
				const output = step?.output as { ok?: boolean } | undefined;
				return step?.status === "success" && output?.ok === true;
			},
		},
	},
	{
		id: "os.shell",
		handler: osShell,
		label: "运行 Shell 命令",
		catalogDoc: [
			"os.shell: { command: string, args?: string[], cwd?: string } -> { stdout, stderr, exitCode }.",
			"  Allowed commands: ls, find, wc, head, tail, cat, grep, rg, df, du, which, pbpaste, open.",
			"  This is execFile mode: command must be a single executable name, not sh/bash/zsh; no pipes or redirects.",
		].join("\n"),
		validators: {
			"os.shell.exitOk": (results) =>
				everyStepOk(
					results,
					"os.shell",
					(s) =>
						s.status === "success" &&
						(s.output as { exitCode?: number } | undefined)?.exitCode === 0,
				),
			"os.stdout.nonEmpty": (results) => {
				const shell = findStep(results, "os.shell");
				const output = shell?.output as { stdout?: string } | undefined;
				return Boolean(output?.stdout?.trim());
			},
		},
	},
	{
		id: "os.screenshot",
		handler: osScreenshot,
		label: "截取屏幕",
		catalogDoc: [
			'os.screenshot: { target?: "frontmost"|"screen", ocr?: boolean } -> { path, target, bytes, text?, activeApp?, activeWindow? }',
			'  Use frontmost for "当前窗口/屏幕上"; screen for full display. Set ocr:true (or ZHIPU_API_KEY) to read text from image.',
		].join("\n"),
		validators: {
			"os.screenshot.ok": (results) => {
				const step = findStep(results, "os.screenshot");
				const output = step?.output as { path?: string; bytes?: number } | undefined;
				return step?.status === "success" && Boolean(output?.path) && (output?.bytes ?? 0) > 0;
			},
			"os.screenshot.hasText": (results) => {
				const step = findStep(results, "os.screenshot");
				const output = step?.output as { text?: string; ocrError?: string } | undefined;
				return step?.status === "success" && Boolean(output?.text?.trim());
			},
		},
	},
	{
		id: "os.applescript",
		handler: osAppleScript,
		label: "运行 AppleScript",
		catalogDoc: "os.applescript: { script: string } -> { output }",
	},
	{
		id: "os.python",
		handler: osPython,
		label: "运行 Python",
		catalogDoc: [
			"os.python: { code?: string, scriptPath?: string, args?: string[] } -> { stdout, stderr, exitCode }",
			"  Prefer inline code; only pass scriptPath for a file that already exists. Print the final answer to stdout.",
		].join("\n"),
		validators: {
			"os.python.exitOk": (results) =>
				everyStepOk(
					results,
					"os.python",
					(s) =>
						s.status === "success" &&
						(s.output as { exitCode?: number } | undefined)?.exitCode === 0,
				),
		},
	},
];

export async function executeSkill(
	skillId: string,
	args: Record<string, unknown>,
	ctx: SkillContext,
): Promise<unknown> {
	const skill = REGISTRY.find((s) => s.id === skillId);
	if (!skill) throw new Error(`Unknown skill: ${skillId}`);
	return skill.handler(args, ctx);
}

export function listSkills(): string[] {
	return REGISTRY.map((s) => s.id);
}

export function listSkillManifests(): ReadonlyArray<SkillDefinition> {
	return REGISTRY;
}

/** Planner prompt 的 skill 目录，从 manifest 派生；末尾附上用户已装插件列表。 */
export function buildSkillCatalog(): string {
	const lines = ["Available skills:", ...REGISTRY.map((s) => `- ${s.catalogDoc}`)];
	const plugins = loadPluginManifests();
	if (plugins.length > 0) {
		lines.push("", "Installed plugins (for plugin.cli):");
		for (const p of plugins) {
			lines.push(`- "${p.id}" (${p.label}, binary: ${p.binary})${p.catalogDoc ? `: ${p.catalogDoc}` : ""}`);
		}
	}
	return lines.join("\n");
}

/** 步骤中文名，从 manifest 派生。 */
export function labelForSkill(skill: string): string {
	return REGISTRY.find((s) => s.id === skill)?.label ?? skill;
}

const OFFICE_CHANNEL_LABELS: Record<string, string> = {
	feishu: "飞书",
	github: "GitHub",
	dingtalk: "钉钉",
	wecom: "企业微信",
	slack: "Slack",
};

/** 带上下文的中文步骤名（如 office.cli → 飞书 CLI）。 */
export function labelForStep(
	skill: string,
	ctx?: { output?: unknown; args?: Record<string, unknown> },
): string {
	if (skill === "office.cli") {
		const channel =
			(ctx?.output as { channel?: string } | undefined)?.channel ??
			(typeof ctx?.args?.channel === "string" ? ctx.args.channel : undefined);
		if (channel && OFFICE_CHANNEL_LABELS[channel]) {
			return `${OFFICE_CHANNEL_LABELS[channel]} CLI`;
		}
	}
	if (skill === "plugin.cli") {
		const plugin =
			(ctx?.output as { plugin?: string } | undefined)?.plugin ??
			(typeof ctx?.args?.plugin === "string" ? ctx.args.plugin : undefined);
		if (typeof plugin === "string" && plugin.trim()) return `${plugin} CLI`;
	}
	return labelForSkill(skill);
}

/** 合并全部 manifest 的验证规则表。 */
export function collectSkillValidators(): Record<string, SkillValidator> {
	const rules: Record<string, SkillValidator> = {};
	for (const skill of REGISTRY) {
		Object.assign(rules, skill.validators);
	}
	return rules;
}

export type { SkillContext, SkillHandler } from "./types.js";
