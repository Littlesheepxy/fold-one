import { executeWorkBuddyTask } from "@fold/connectors";
import type { SkillContext } from "../types.js";

export async function workbuddyRun(args: Record<string, unknown>, ctx: SkillContext) {
	const query = String(args.query ?? args.brief ?? "").trim();
	if (!query) throw new Error("workbuddy.run: query required");

	ctx.emit({ type: "progress", message: "正在调用 WorkBuddy…" });
	return executeWorkBuddyTask({
		capability: typeof args.capability === "string" ? args.capability : undefined,
		query,
		params:
			args.params && typeof args.params === "object"
				? (args.params as Record<string, unknown>)
				: undefined,
		onEvent: (taskEvent) =>
			ctx.emit({ type: "progress", message: taskEvent.message, taskEvent }),
	});
}
