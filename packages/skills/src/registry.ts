import {
	clipboardRead,
	finderLatestDownload,
	mailCountUnread,
	mailDraft,
	mailOpen,
	pdfExtract,
} from "./builtin/index.js";
import * as agentSkill from "./builtin/agent.js";
import { browserCurrentPage, browserInteractSkill } from "./builtin/browser.js";
import { feishuMailTriage } from "./builtin/feishu.js";
import { guiUitars } from "./builtin/gui.js";
import { slackUnread } from "./builtin/slack.js";
import { workbuddyRun } from "./builtin/workbuddy.js";
import { osAppleScript, osPython, osShell } from "./builtin/os-runtime.js";
import { osScreenshot } from "./builtin/screenshot.js";
import type { SkillContext, SkillDefinition } from "./types.js";

const REGISTRY: SkillDefinition[] = [
	{ id: "finder.latestDownload", handler: finderLatestDownload },
	{ id: "pdf.extract", handler: pdfExtract },
	{ id: "mail.open", handler: mailOpen },
	{ id: "mail.countUnread", handler: mailCountUnread },
	{ id: "mail.draft", handler: mailDraft },
	{ id: "clipboard.read", handler: clipboardRead },
	{ id: "browser.currentPage", handler: browserCurrentPage },
	{ id: "browser.interact", handler: browserInteractSkill },
	{ id: "agent.execute", handler: agentSkill.agentExecute },
	{ id: "gui.uitars", handler: guiUitars },
	{ id: "workbuddy.run", handler: workbuddyRun },
	{ id: "feishu.mail.triage", handler: feishuMailTriage },
	{ id: "slack.unread", handler: slackUnread },
	{ id: "os.shell", handler: osShell },
	{ id: "os.screenshot", handler: osScreenshot },
	{ id: "os.applescript", handler: osAppleScript },
	{ id: "os.python", handler: osPython },
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

export type { SkillContext, SkillHandler } from "./types.js";
