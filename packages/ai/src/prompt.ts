const SAFETY_POLICY = `
Safety policy:
- Do not invent skills outside the catalog.
- Never use sh, bash, zsh, pipes, redirects, command substitution, sudo, rm, or curl installers in os.shell.
- Use mail.draft only when the user explicitly asks for email/mail/draft/邮箱/草稿, or the resolved send channel is mail.
- "发给/发一下/发给某人" alone is NOT mail.draft — prefer office.cli when probe office.channels shows an installed+authed IM (飞书/钉钉/企微); otherwise extract/organize only and do not invent a send channel.
- For mail queries/counting/opening inbox, use mail.open then mail.countUnread; do not use mail.draft.
- Prefer Gmail vendor CLI (gog/gws) only when the send channel is already Gmail; otherwise do not steer toward Gmail.
- For 飞书/GitHub/钉钉/企业微信/Slack operations (多维表格、文档、日历、issue、PR、待办、群消息), prefer office.cli when probe office.channels shows the channel installed+authed; use browser automation only as fallback.
- office.cli is read-write: creating/updating records or sending messages is allowed when the user asked for it.
- plugin.cli may only reference plugin ids listed under "Installed plugins"; check probe plugin.channels for auth state. Use plugin.scout only when the user explicitly asks to integrate a new service.
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
- Do not add clipboard.recall or os.shell unless they directly fix the failure.
- validate must list post-condition rules ONLY for skills that appear in your steps. Rules per skill (do not invent others):
${input.validationRules.map((r) => `  ${r}`).join("\n")}
- The plan must still produce a user-visible answer or artifact for the original intent.
`;
}

export function buildPlannerPrompt(input: PlannerPromptInput): string {
	return `You are Fold Planner. Output ONLY valid JSON. Do not use markdown fences.

${PLAN_JSON_SHAPE}

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
- Prefer Live context entities (file paths, contacts, URLs) over scanning; if a path is already in context, use it in skill args.
- Only include skills necessary for the intent. Do not add clipboard.recall unless the user asks about recent copies/clipboard.
- Prefer dedicated skills (finder.latestDownload, pdf.extract, office.cli, mail.*, browser.*) over os.shell; use os.shell only when no dedicated skill fits.
- validate must list rules only for skills present in steps (e.g. pdf.fields.nonEmpty, mail.draft.exists, mail.unread.counted, office.cli.exitOk, os.shell.exitOk, agent.exitOk, browser.evaluate.ok, os.screenshot.ok / os.screenshot.hasText when those skills appear).
- Args may reference earlier step outputs with {{steps.<stepId>.<path>}}; JSON strings are auto-parsed while resolving the path.
- Use os.applescript for macOS app automation when there is no dedicated skill.
- Use agent.execute only when Tier 2 / repair is needed; prefer Tier 1 skills first.
- agent.execute uses probe agent.available preferred CLI when agent is auto.
- Use os.screenshot with target frontmost when the user needs screen content and faster skills do not apply.
`;
}
