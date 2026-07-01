import { executeUitarsTask } from "@fold/connectors";
import type { SkillContext } from "../types.js";

export async function guiUitars(args: Record<string, unknown>, ctx: SkillContext) {
	const goal = String(args.goal ?? args.brief ?? "").trim();
	if (!goal) throw new Error("gui.uitars: goal required");

	ctx.emit({ type: "progress", message: "Running UI-TARS GUI repair" });
	return executeUitarsTask({
		goal,
		budget: typeof args.budget === "number" ? args.budget : 5,
	});
}
