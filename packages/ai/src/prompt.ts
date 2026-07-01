const SKILL_CATALOG = `
Available skills:
- finder.latestDownload: { ext?: string, since?: string } -> { path, name, size }
- pdf.extract: { path: string, fields?: string[] } -> { vendor?, amount?, date?, rawText? }
- mail.open: {} -> { provider, opened }
- mail.countUnread: {} -> { provider, count, backend? } (prefers gog/gws CLI over browser CDP)
- mail.draft: { to: string, subject?: string, body: string, template?: string } -> { subject, to }
- browser.currentPage: {} -> { url, title, selectedText?, pages[], cdpUrl?, connected }
- browser.interact: { action: "goto"|"click"|"fill", url?, selector?, value? } -> { ok, url, title, action }
- agent.execute: { brief: string, agent?: "auto"|"claude-code"|"codex"|"cursor", cwd?: string, allowEdits?: boolean } -> { ok, agentId, summary, exitCode, handoff? }
- gui.uitars: { goal: string, budget?: number } -> { ok, summary, stepsUsed } (requires FOLD_ALLOW_UITARS=1 + VLM API key)
- workbuddy.run: { query: string, capability?: string } -> { ok, summary } (Work Buddy MCP gateway; search then auto-run best match)
- feishu.mail.triage: { query?: string, max?: number } -> { ok, count, summary } (requires lark-cli)
- slack.unread: { limit?: number } -> { ok, count, summary } (requires slack-cli or slk)
- clipboard.read: {} -> { text }
- os.shell: { command: string, args?: string[], cwd?: string } -> { stdout, stderr, exitCode }.
  Allowed commands: ls, find, wc, head, tail, cat, grep, rg, df, du, which, pbpaste, open.
  This is execFile mode: command must be a single executable name, not sh/bash/zsh; no pipes or redirects.
- os.applescript: { script: string } -> { output }
- os.python: { code?: string, scriptPath?: string, args?: string[] } -> { stdout, stderr, exitCode }
- os.screenshot: { target?: "frontmost"|"screen", ocr?: boolean } -> { path, target, bytes, text?, activeApp?, activeWindow? }
  Use frontmost for "当前窗口/屏幕上"; screen for full display. Set ocr:true (or ZHIPU_API_KEY) to read text from image.
`.trim();

const SAFETY_POLICY = `
Safety policy:
- Do not invent skills outside the catalog.
- Never use sh, bash, zsh, pipes, redirects, command substitution, sudo, rm, or curl installers in os.shell.
- Use mail.draft only when the user explicitly asks to create/write a draft.
- For mail queries/counting/opening inbox, use mail.open then mail.countUnread; do not use mail.draft.
- Prefer Gmail vendor CLI (gog/gws) when installed; use browser CDP only when no CLI binary is on PATH.
- When the user names Gmail explicitly, mail skills must target Gmail CLI first, not Apple Mail.
- Complete the user's intent with a concrete outcome; do not stop at partial progress if another catalog skill can finish the job.
- Completion mandate: when the user states a clear, actionable request, the plan must produce a user-visible answer or artifact (count, list summary, draft, extracted text, screenshot readout). If faster skills fail validation, escalate: os.screenshot (ocr) before gui.uitars for read-only tasks.
- Prefer clipboard.read and browser.currentPage before os.screenshot; use os.screenshot before gui.uitars when only visual context is needed (no clicking).
- If os.screenshot uses ocr and returns text, answer the user from that text in the final result.
`.trim();

export interface PlannerPromptInput {
	intent: string;
	contextSummary: string;
	probeSummary?: string;
	relevantEpisodes?: string;
	relevantMemories?: string;
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

${SKILL_CATALOG}

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
- validate must include os.screenshot.ok when os.screenshot is used to answer the user.
- validate must include os.screenshot.hasText when os.screenshot uses ocr to answer a read-screen question.
- Use os.screenshot with target frontmost when user says 截屏/屏幕/当前窗口/看一下这个界面 and faster skills do not apply.
- If mail.countUnread alone cannot answer the user (they ask 什么样的邮件/主题/发件人), prefer CLI search or browser read before stopping.
`;
}
