import type { ActionPlan } from "@fold/ai";
import type { StepResult } from "./types.js";

export interface ValidationResult {
	ok: boolean;
	checks: Array<{ rule: string; passed: boolean; message?: string }>;
}

type RuleFn = (plan: ActionPlan, results: StepResult[]) => boolean;

const RULES: Record<string, RuleFn> = {
	"pdf.fields.nonEmpty": (_plan, results) => {
		const pdf = results.find((r) => r.skill === "pdf.extract");
		if (!pdf?.output || typeof pdf.output !== "object") return false;
		const o = pdf.output as Record<string, unknown>;
		return Object.values(o).some((v) => v != null && String(v).trim() !== "");
	},
	"mail.draft.exists": (_plan, results) => {
		const mail = results.find((r) => r.skill === "mail.draft");
		return mail?.status === "success";
	},
	"mail.unread.counted": (_plan, results) => {
		const mail = results.find((r) => r.skill === "mail.countUnread");
		const output = mail?.output as { count?: number } | undefined;
		return mail?.status === "success" && typeof output?.count === "number";
	},
	"os.shell.exitOk": (_plan, results) => {
		const shell = results.find((r) => r.skill === "os.shell");
		const output = shell?.output as { exitCode?: number } | undefined;
		return shell?.status === "success" && output?.exitCode === 0;
	},
	"os.stdout.nonEmpty": (_plan, results) => {
		const shell = results.find((r) => r.skill === "os.shell");
		const output = shell?.output as { stdout?: string } | undefined;
		return Boolean(output?.stdout?.trim());
	},
	"agent.exitOk": (_plan, results) => {
		const agent = results.find((r) => r.skill === "agent.execute");
		const output = agent?.output as { ok?: boolean } | undefined;
		return agent?.status === "success" && output?.ok === true;
	},
	"browser.page.ready": (_plan, results) => {
		const page = results.find((r) => r.skill === "browser.currentPage");
		const output = page?.output as { url?: string } | undefined;
		return page?.status === "success" && Boolean(output?.url);
	},
	"browser.interact.ok": (_plan, results) => {
		const interact = results.find((r) => r.skill === "browser.interact");
		const output = interact?.output as { ok?: boolean } | undefined;
		return interact?.status === "success" && output?.ok === true;
	},
	"gui.uitars.ok": (_plan, results) => {
		const step = results.find((r) => r.skill === "gui.uitars");
		const output = step?.output as { ok?: boolean } | undefined;
		return step?.status === "success" && output?.ok === true;
	},
	"workbuddy.run.ok": (_plan, results) => {
		const step = results.find((r) => r.skill === "workbuddy.run");
		const output = step?.output as { ok?: boolean } | undefined;
		return step?.status === "success" && output?.ok === true;
	},
	"os.screenshot.ok": (_plan, results) => {
		const step = results.find((r) => r.skill === "os.screenshot");
		const output = step?.output as { path?: string; bytes?: number } | undefined;
		return (
			step?.status === "success" &&
			Boolean(output?.path) &&
			((output?.bytes ?? 0) > 0)
		);
	},
	"os.screenshot.hasText": (_plan, results) => {
		const step = results.find((r) => r.skill === "os.screenshot");
		const output = step?.output as { text?: string; ocrError?: string } | undefined;
		return step?.status === "success" && Boolean(output?.text?.trim());
	},
};

export function validatePlan(plan: ActionPlan, steps: StepResult[]): ValidationResult {
	const checks = plan.validate.map((rule) => {
		const fn = RULES[rule];
		const passed = fn ? fn(plan, steps) : true;
		return { rule, passed, message: passed ? undefined : `Validation failed: ${rule}` };
	});
	return { ok: checks.every((c) => c.passed), checks };
}
