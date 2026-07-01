import { browserInteract, getCurrentBrowserPage } from "@fold/connectors";
import type { SkillContext } from "../types.js";

export async function browserCurrentPage(_args: Record<string, unknown>, ctx: SkillContext) {
	ctx.emit({ type: "progress", message: "Reading browser page via CDP" });
	return getCurrentBrowserPage();
}

export async function browserInteractSkill(args: Record<string, unknown>, ctx: SkillContext) {
	const action = String(args.action ?? "") as "goto" | "click" | "fill";
	if (!["goto", "click", "fill"].includes(action)) {
		throw new Error("browser.interact: action must be goto|click|fill");
	}

	ctx.emit({ type: "progress", message: `Browser ${action} via CDP` });

	let url = typeof args.url === "string" ? args.url : undefined;
	if (!url && action === "goto") {
		url = ctx.liveContext.recentUrls[0]?.url;
	}

	return browserInteract({
		action,
		url,
		selector: typeof args.selector === "string" ? args.selector : undefined,
		value: typeof args.value === "string" ? args.value : undefined,
	});
}
