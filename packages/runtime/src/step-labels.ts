const SKILL_LABELS: Record<string, string> = {
	"finder.latestDownload": "查找最近下载",
	"pdf.extract": "读取 PDF",
	"mail.open": "打开邮件",
	"mail.countUnread": "统计未读邮件",
	"mail.draft": "创建邮件草稿",
	"clipboard.read": "读取剪贴板",
	"os.shell": "运行 Shell 命令",
	"os.applescript": "运行 AppleScript",
	"os.python": "运行 Python",
	"os.screenshot": "截取屏幕",
	"browser.currentPage": "读取浏览器页面",
	"browser.interact": "浏览器操作",
	"agent.execute": "本地 Agent 子任务",
	"gui.uitars": "UI-TARS 界面修复",
	"workbuddy.run": "Work Buddy 工作流",
	"feishu.mail.triage": "飞书邮件检索",
	"slack.unread": "Slack 未读消息",
};

export function labelForSkill(skill: string): string {
	return SKILL_LABELS[skill] ?? skill;
}
