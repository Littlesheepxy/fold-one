import { executeLarkMailTriage } from "@fold/connectors";
import type { SkillContext } from "../types.js";

export async function feishuMailTriage(args: Record<string, unknown>, ctx: SkillContext) {
	const query = typeof args.query === "string" ? args.query : undefined;
	const max = typeof args.max === "number" ? args.max : undefined;

	ctx.emit({ type: "progress", message: "Listing Feishu mail via lark-cli" });
	return executeLarkMailTriage({ query, max });
}
