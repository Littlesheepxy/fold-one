import { runAppleScript } from "../shell.js";

export interface ChromeTabInfo {
	url: string;
	title: string;
	/** 前台窗口的活动标签页 */
	active: boolean;
}

// 注意：在 Chrome 的 tell 块里，"tab" 会被解析成 Chrome 的标签页类而非制表符常量，
// 所以分隔符必须在 tell 块外先存进变量。
const LIST_TABS_SCRIPT = `
set sep to character id 9
tell application "Google Chrome"
	set activeUrl to ""
	try
		set activeUrl to URL of active tab of front window
	end try
	set out to ""
	repeat with w in windows
		repeat with t in tabs of w
			set isActive to "0"
			if (URL of t) is activeUrl then set isActive to "1"
			set out to out & isActive & sep & (URL of t) & sep & (title of t) & linefeed
		end repeat
	end repeat
	return out
end tell
`.trim();

/**
 * 用 AppleScript 列出用户 Chrome 的真实标签页。
 * 读取 URL/标题不需要开启「允许 Apple 事件中的 JavaScript」，只需自动化权限。
 */
export async function listChromeTabsViaAppleScript(): Promise<ChromeTabInfo[]> {
	const raw = await runAppleScript(LIST_TABS_SCRIPT, 8000);
	const tabs: ChromeTabInfo[] = [];
	for (const line of raw.split("\n")) {
		const [active, url, ...titleParts] = line.split("\t");
		if (!url?.startsWith("http")) continue;
		tabs.push({ url, title: titleParts.join("\t").trim(), active: active === "1" });
	}
	return tabs;
}

/** 选出用户"正在看"的网页标签：前台活动标签优先，否则第一个 http 标签。 */
export function pickActiveChromeTab(tabs: ChromeTabInfo[]): ChromeTabInfo | undefined {
	return tabs.find((t) => t.active) ?? tabs[0];
}
