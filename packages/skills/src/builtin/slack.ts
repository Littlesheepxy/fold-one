import { executeSlackUnread } from "@fold/connectors";
import type { SkillContext } from "../types.js";

export async function slackUnread(_args: Record<string, unknown>, ctx: SkillContext) {
	const limit = typeof _args.limit === "number" ? _args.limit : 50;
	ctx.emit({ type: "progress", message: "Listing Slack unreads via CLI" });
	return executeSlackUnread(limit);
}
