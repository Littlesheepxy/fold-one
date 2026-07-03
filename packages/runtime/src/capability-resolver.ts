/**
 * Capability Resolver —— 「这个意图需要什么能力」的唯一判定处。
 * 所有意图分类正则都集中在这里；router / recovery / repair / auth-gate /
 * capability-brief / probe-runner / orchestrator 一律从这里消费，不再各自维护。
 *
 * 例外：isMailCountIntent 定义在 @fold/ai（mockActionPlan / normalizeActionPlan
 * 需要它，而 ai 不能反向依赖 runtime），这里统一转出口。
 */
import { isMailCountIntent } from "@fold/ai";

export { isMailCountIntent };

// ---- 渠道 / 服务 ----

const GMAIL_HINTS = /gmail|谷歌邮箱|google\s*mail/i;
const FEISHU_HINTS = /飞书|feishu|lark/i;
const BROWSER_HINTS =
	/浏览器|网页|页面|网站|标签页|当前.{0,8}浏览|正在浏览|chrome|同步.{0,6}飞书|飞书.{0,6}表|多维表格|抓取.{0,6}页/i;
const DOWNLOADS_HINTS = /(download|下载|文件|pdf)/i;
const MAIL_CONTENT_HINTS = /什么样|主题|发件人|内容|列表|summary|list|recent/i;

export function isGmailIntent(intent: string): boolean {
	return GMAIL_HINTS.test(intent);
}

export function isFeishuIntent(intent: string): boolean {
	return FEISHU_HINTS.test(intent);
}

export function isBrowserIntent(intent: string): boolean {
	return BROWSER_HINTS.test(intent);
}

export function mentionsDownloads(intent: string): boolean {
	return DOWNLOADS_HINTS.test(intent);
}

/** 用户想看邮件内容（主题/发件人/列表），而不只是数量。 */
export function wantsMailContent(intent: string): boolean {
	return MAIL_CONTENT_HINTS.test(intent);
}

// ---- Tier 0 编译计划匹配 ----

export function isPdfDownloadCountIntent(intent: string): boolean {
	return (
		/(download|下载)/i.test(intent) && /pdf/i.test(intent) && /(多少|几个|count)/i.test(intent)
	);
}

export function isPdfMailDemoIntent(intent: string): boolean {
	return /刚下载.*pdf.*(邮件|mail|发)/i.test(intent);
}

// ---- 视觉 / GUI ----

const SCREENSHOT_HINTS = /截屏|截图|屏幕|当前窗口|界面|看一下.{0,6}(屏|窗口|页面)/i;
const VISUAL_READ_HINTS =
	/截屏|截图|屏幕|当前窗口|界面|看一下|读.{0,4}(屏|窗口|页面)|屏幕上|显示什么|有什么内容/i;
const CLICK_GUI_HINTS = /点击|打开|登录|填写|提交|发送|创建|删除|关闭|切换|拖拽/i;
const GUI_REPAIR_HINTS = /(点击|登录|表单|按钮|页面|截图|browser|网页|网站)/i;
const REACT_HINTS = [
	/点击/,
	/拖拽/,
	/按钮/,
	/表单/,
	/登录/,
	/截图/,
	/看屏幕/,
	/页面.*操作/,
	/browser.*use/i,
	/帮我填/,
	/模拟点击/,
];

export function isScreenshotIntent(intent: string): boolean {
	return SCREENSHOT_HINTS.test(intent);
}

/** User wants to read or summarize what's on screen (not necessarily click). */
export function needsVisualRead(intent: string): boolean {
	return VISUAL_READ_HINTS.test(intent);
}

export function needsClickGui(intent: string): boolean {
	return CLICK_GUI_HINTS.test(intent);
}

export function mayNeedScreenPermission(intent: string, planUsesScreenshot: boolean): boolean {
	return planUsesScreenshot || isScreenshotIntent(intent) || needsVisualRead(intent);
}

export function isGuiIntent(intent: string): boolean {
	return GUI_REPAIR_HINTS.test(intent);
}

/** 意图需要动态 GUI 交互（Tier 2 react 路径）。 */
export function needsReactGui(intent: string): boolean {
	return REACT_HINTS.some((pattern) => pattern.test(intent));
}

// ---- 修复 / 恢复 ----

const CODE_REPAIR_HINTS = /(代码|仓库|repo|项目|修复|fix|bug|测试|test|refactor|implement)/i;
const WORKFLOW_HINTS = /(workflow|工作流|obsidian|vault|workbuddy|待办|笔记同步|知识库)/i;
const NATIVE_APP_HINTS = /(微信|wechat|飞书|feishu|lark|slack|finder|访达)/i;

/** text 可以是 intent，也可以是 intent + 错误信息的拼接。 */
export function isCodeRepairHint(text: string): boolean {
	return CODE_REPAIR_HINTS.test(text);
}

export function isWorkflowIntent(intent: string): boolean {
	return WORKFLOW_HINTS.test(intent);
}

/** text 可以是 intent，也可以是当前活跃 App 名。 */
export function hasNativeAppHint(text: string): boolean {
	return NATIVE_APP_HINTS.test(text);
}
