const SCREENSHOT_HINTS = /截屏|截图|屏幕|当前窗口|界面|看一下.{0,6}(屏|窗口|页面)/i;
const VISUAL_READ_HINTS =
	/截屏|截图|屏幕|当前窗口|界面|看一下|读.{0,4}(屏|窗口|页面)|屏幕上|显示什么|有什么内容/i;
const CLICK_GUI_HINTS = /点击|打开|登录|填写|提交|发送|创建|删除|关闭|切换|拖拽/i;

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
