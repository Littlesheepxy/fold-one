import type { ActionPlan } from "@fold/ai";
import { labelForSkill } from "./step-labels.js";
import type { StepResult } from "./types.js";

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
		...plan.steps.map((step, index) => `${index + 1}. ${labelForSkill(step.skill)}`),
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
		const name = labelForSkill(step.skill);
		if (step.status === "failed") {
			lines.push(`• ${name}：失败${step.error ? `（${step.error}）` : ""}`);
			continue;
		}

		const output = step.output;
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
