import { browserEvaluate, browserInteract, getCurrentBrowserPage } from "@fold/connectors";
import type { SkillContext } from "../types.js";

export async function browserCurrentPage(_args: Record<string, unknown>, ctx: SkillContext) {
	ctx.emit({ type: "progress", message: "Reading browser page via CDP" });
	return getCurrentBrowserPage();
}

export async function browserEvaluateSkill(args: Record<string, unknown>, ctx: SkillContext) {
	const code = typeof args.code === "string" ? args.code.trim() : "";
	if (!code) throw new Error("browser.evaluate 需要 code（JS 函数表达式，如 () => document.title）");
	const url = typeof args.url === "string" && args.url.trim() ? args.url.trim() : undefined;
	const urlPattern =
		typeof args.urlPattern === "string" && args.urlPattern.trim() ? args.urlPattern.trim() : undefined;

	ctx.emit({ type: "progress", message: "Evaluating JS in user browser" });
	return browserEvaluate(code, url, urlPattern);
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
