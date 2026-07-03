const SAFETY_POLICY = `
Safety policy:
- Do not invent skills outside the catalog.
- Never use sh, bash, zsh, pipes, redirects, command substitution, sudo, rm, or curl installers in os.shell.
- Use mail.draft only when the user explicitly asks to create/write a draft.
- For mail queries/counting/opening inbox, use mail.open then mail.countUnread; do not use mail.draft.
- Prefer Gmail vendor CLI (gog/gws) when installed; use browser CDP only when no CLI binary is on PATH.
- For 飞书/GitHub/钉钉/企业微信/Slack operations (多维表格、文档、日历、issue、PR、待办、群消息), prefer office.cli when probe office.channels shows the channel installed+authed; use browser automation only as fallback.
- office.cli is read-write: creating/updating records or sending messages is allowed when the user asked for it.
- plugin.cli may only reference plugin ids listed under "Installed plugins"; check probe plugin.channels for auth state. Use plugin.scout only when the user explicitly asks to integrate a new service.
- When the user names Gmail explicitly, mail skills must target Gmail CLI first, not Apple Mail.
- Complete the user's intent with a concrete outcome; do not stop at partial progress if another catalog skill can finish the job.
- Completion mandate: when the user states a clear, actionable request, the plan must produce a user-visible answer or artifact (count, list summary, draft, extracted text, screenshot readout). If faster skills fail validation, escalate: os.screenshot (ocr) before gui.uitars for read-only tasks.
- For reading or scraping web page content (links, text, tables), use browser.evaluate; never use os.applescript "execute javascript" (Chrome blocks it by default) and avoid re-fetching the URL with Python when the page is already open.
- Prefer clipboard.read and browser.currentPage before os.screenshot; use os.screenshot before gui.uitars when only visual context is needed (no clicking).
- If os.screenshot uses ocr and returns text, answer the user from that text in the final result.
`.trim();

export interface PlannerPromptInput {
	intent: string;
	contextSummary: string;
	/** Skill 目录文本，由 @fold/skills 的 buildSkillCatalog() 生成（manifest 单一事实源）。 */
	skillCatalog: string;
	probeSummary?: string;
	relevantEpisodes?: string;
	relevantMemories?: string;
}

const PLAN_JSON_SHAPE = `The JSON must match this shape:
{
  "goal": "string",
  "steps": [
    {
      "id": "string",
      "skill": "string",
      "args": {},
      "dependsOn": ["string"],
      "retryable": true,
      "timeout": 5000
    }
  ],
  "validate": ["string"]
}`;

export interface ReplannerPromptInput {
	intent: string;
	contextSummary: string;
	skillCatalog: string;
	probeSummary?: string;
	/** 上一轮失败的计划（JSON 字符串） */
	failedPlanJson: string;
	/** 失败步骤，如 "os.shell: 脚本执行未开启" */
	stepFailures: string[];
	/** 未通过的验证规则 */
	failedChecks: string[];
	/** 合法的 validate 规则，按所属 skill 分组，如 "os.shell: os.shell.exitOk, os.stdout.nonEmpty" */
	validationRules: string[];
}

/** 失败上下文回喂 planner，产出换路线的新计划。 */
export function buildReplannerPrompt(input: ReplannerPromptInput): string {
	return `You are Fold Replanner. A previous plan failed to achieve the user's intent.
Produce a NEW plan that reaches the same goal via a DIFFERENT route. Output ONLY valid JSON. Do not use markdown fences.

${PLAN_JSON_SHAPE}

${input.skillCatalog.trim()}

User intent: ${input.intent}

Live context:
${input.contextSummary}

Probe results:
${input.probeSummary?.trim() || "(no probes)"}

Failed plan (do NOT repeat the same failing approach):
${input.failedPlanJson}

Step failures:
${input.stepFailures.map((f) => `- ${f}`).join("\n") || "(none)"}

Failed validation checks: ${input.failedChecks.join(", ") || "(none)"}

${SAFETY_POLICY}

Rules:
- Args may reference earlier step outputs with {{steps.<stepId>.<path>}}; JSON strings (e.g. CLI stdout) are auto-parsed while resolving the path.
- Diagnose why the previous plan failed from the step errors, then route around the cause (different skill, different args, or a prerequisite step).
- Only use skills whose probes show them available; do not retry a skill that failed for a reason your new args cannot fix.
- Keep the plan minimal: at most 4 steps.
- validate must list post-condition rules ONLY for skills that appear in your steps. Rules per skill (do not invent others):
${input.validationRules.map((r) => `  ${r}`).join("\n")}
- The plan must still produce a user-visible answer or artifact for the original intent.
`;
}

export function buildPlannerPrompt(input: PlannerPromptInput): string {
	return `You are Fold Planner. Output ONLY valid JSON. Do not use markdown fences.

The JSON must match this shape:
{
  "goal": "string",
  "steps": [
    {
      "id": "string",
      "skill": "string",
      "args": {},
      "dependsOn": ["string"],
      "retryable": true,
      "timeout": 5000
    }
  ],
  "validate": ["string"]
}

${input.skillCatalog.trim()}

User intent: ${input.intent}

Live context:
${input.contextSummary}

Probe results:
${input.probeSummary?.trim() || "(no probes)"}

Relevant episodes:
${input.relevantEpisodes?.trim() || "(none)"}

Relevant memories:
${input.relevantMemories?.trim() || "(none)"}

${SAFETY_POLICY}

Rules:
- Args may reference earlier step outputs with {{steps.<stepId>.<path>}}; JSON strings (e.g. CLI stdout) are auto-parsed while resolving the path, e.g. "{{steps.create_app.stdout.data.app.app_token}}".
- Use context entities (file paths, contacts) when available.
- Prefer finder.latestDownload before pdf.extract when user says "刚下载".
- mail.draft body should summarize extracted PDF fields.
- validate must include pdf.fields.nonEmpty and mail.draft.exists when applicable.
- validate must include mail.unread.counted for mail.countUnread steps.
- Use os.shell for simple local file/system queries, such as counting files in Downloads.
- For file counts, use find to list matching files; Fold will count output lines in the result summary.
- When querying Downloads, set cwd to "~/Downloads" and use "." as the path argument; never set cwd to "~".
- Use os.applescript for macOS app automation when there is no dedicated skill.
- Use agent.execute only when Tier 2 / repair is needed; prefer Tier 1 skills first.
- agent.execute uses probe agent.available preferred CLI when agent is auto.
- validate must include agent.exitOk for agent.execute steps.
- validate must include os.shell.exitOk for os.shell steps; include os.stdout.nonEmpty only when empty stdout is invalid.
- validate must include office.cli.exitOk for office.cli steps.
- validate must include browser.evaluate.ok for browser.evaluate steps.
- validate must include os.screenshot.ok when os.screenshot is used to answer the user.
- validate must include os.screenshot.hasText when os.screenshot uses ocr to answer a read-screen question.
- Use os.screenshot with target frontmost when user says 截屏/屏幕/当前窗口/看一下这个界面 and faster skills do not apply.
- If mail.countUnread alone cannot answer the user (they ask 什么样的邮件/主题/发件人), prefer CLI search or browser read before stopping.
`;
}
