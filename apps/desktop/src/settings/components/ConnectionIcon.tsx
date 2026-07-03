import { Bot, Github, MessageSquare, Monitor, Plug, Slack } from "lucide-react";
import { BRAND_ICONS, BrandIcon, ChromeIcon } from "./brand-icons.js";

export function ConnectionIcon({ id, size = 18 }: { id: string; size?: number }) {
	switch (id) {
		case "agent":
		case "claude-code":
			return <BrandIcon src={BRAND_ICONS.claude} size={size} alt="Claude Code" />;
		case "codex":
			return <BrandIcon src={BRAND_ICONS.codex} size={size} alt="Codex" />;
		case "cursor":
			return <BrandIcon src={BRAND_ICONS.cursor} size={size} alt="Cursor Agent" />;
		case "gmail":
			return <BrandIcon src={BRAND_ICONS.google} size={size} alt="Gmail" />;
		case "nango":
			return <Plug size={size} className="shrink-0 text-neutral-500" strokeWidth={1.75} />;
		case "office-github":
			return <Github size={size} className="shrink-0 text-neutral-700" strokeWidth={1.75} />;
		case "office-slack":
			return <Slack size={size} className="shrink-0 text-[#611f69]" strokeWidth={1.75} />;
		case "office-feishu":
			return <MessageSquare size={size} className="shrink-0 text-[#3370ff]" strokeWidth={1.75} />;
		case "office-dingtalk":
			return <MessageSquare size={size} className="shrink-0 text-[#0089ff]" strokeWidth={1.75} />;
		case "office-wecom":
			return <MessageSquare size={size} className="shrink-0 text-[#0082ef]" strokeWidth={1.75} />;
		case "cdp":
			return <ChromeIcon size={size} />;
		case "screen":
			return <Monitor size={size} className="shrink-0 text-neutral-500" strokeWidth={1.75} />;
		case "uitars":
			return <BrandIcon src={BRAND_ICONS.bytedance} size={size} alt="UI-TARS" />;
		case "workbuddy":
			return <BrandIcon src={BRAND_ICONS.cursor} size={size} alt="Work Buddy" />;
		default:
			return <Bot size={size} className="shrink-0 text-neutral-400" strokeWidth={1.75} />;
	}
}
