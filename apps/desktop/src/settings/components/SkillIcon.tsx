import {
	Bot,
	Clipboard,
	FileText,
	FolderOpen,
	Mail,
	Monitor,
	MousePointerClick,
	Terminal,
} from "lucide-react";
import { ChromeIcon } from "./brand-icons.js";

/** 执行步骤按 skill 显示对应应用/工具图标 */
export function SkillIcon({ skill, size = 14 }: { skill: string; size?: number }) {
	const cls = "shrink-0 text-[#6e6e73]";
	if (skill.startsWith("browser.")) return <ChromeIcon size={size} />;
	if (skill.startsWith("mail.") || skill.startsWith("feishu.mail")) {
		return <Mail size={size} className={cls} strokeWidth={1.75} />;
	}
	if (skill === "pdf.extract") return <FileText size={size} className={cls} strokeWidth={1.75} />;
	if (skill.startsWith("finder.")) return <FolderOpen size={size} className={cls} strokeWidth={1.75} />;
	if (skill === "os.screenshot") return <Monitor size={size} className={cls} strokeWidth={1.75} />;
	if (skill.startsWith("os.")) return <Terminal size={size} className={cls} strokeWidth={1.75} />;
	if (skill === "agent.execute" || skill === "workbuddy.run") {
		return <Bot size={size} className={cls} strokeWidth={1.75} />;
	}
	if (skill === "gui.uitars") {
		return <MousePointerClick size={size} className={cls} strokeWidth={1.75} />;
	}
	if (skill.startsWith("clipboard.")) {
		return <Clipboard size={size} className={cls} strokeWidth={1.75} />;
	}
	return <Terminal size={size} className={cls} strokeWidth={1.75} />;
}
