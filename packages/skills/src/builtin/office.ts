import { isOfficeChannelId, runOfficeCli } from "@fold/connectors";
import type { SkillContext } from "../types.js";

export async function officeCli(args: Record<string, unknown>, ctx: SkillContext) {
	const channel = typeof args.channel === "string" ? args.channel : "";
	if (!isOfficeChannelId(channel)) {
		throw new Error(`office.cli 不支持的渠道: ${channel || "(空)"}`);
	}
	const cliArgs = Array.isArray(args.args) ? args.args.map(String) : [];
	if (cliArgs.length === 0) {
		throw new Error("office.cli 需要 args（CLI 参数数组）");
	}

	ctx.emit({ type: "progress", message: `Running ${channel} CLI: ${cliArgs.slice(0, 4).join(" ")}` });
	return runOfficeCli(channel, cliArgs);
}
