import { useEffect, useState } from "react";
import { Bot, Github, Monitor, Plug } from "lucide-react";
import { BRAND_ICONS, BrandIcon, ChromeIcon } from "./brand-icons.js";

const LOCAL_APP_ICON_CANDIDATES: Record<string, string[]> = {
	"office-feishu": ["Lark", "Feishu", "飞书"],
	"office-dingtalk": ["DingTalk", "钉钉"],
	"office-wecom": ["企业微信", "WeCom"],
};

const localAppIconRequests = new Map<string, Promise<string | null>>();

function useLocalAppIcon(id: string) {
	const [icon, setIcon] = useState<string | null>(null);

	useEffect(() => {
		const candidates = LOCAL_APP_ICON_CANDIDATES[id];
		if (!candidates?.length) {
			setIcon(null);
			return;
		}
		const key = candidates.join("|");
		let cancelled = false;
		let request = localAppIconRequests.get(key);
		if (!request) {
			request = window.fold.getFirstAppIcon(candidates);
			localAppIconRequests.set(key, request);
		}
		void request.then((value) => {
			if (!cancelled) setIcon(value);
		});
		return () => {
			cancelled = true;
		};
	}, [id]);

	return icon;
}

function IntegrationBrandIcon({
	id,
	fallbackSrc,
	alt,
	size,
	scale = 1,
}: {
	id: string;
	fallbackSrc: string;
	alt: string;
	size: number;
	scale?: number;
}) {
	const localIcon = useLocalAppIcon(id);
	const displaySize = Math.round(size * scale);
	const imgClass =
		scale > 1 ? "shrink-0 rounded-[22%] object-contain origin-center" : "shrink-0 rounded-[22%] object-contain";
	const style = scale > 1 ? { width: displaySize, height: displaySize } : undefined;
	if (localIcon) {
		return (
			<img
				src={localIcon}
				width={displaySize}
				height={displaySize}
				alt={alt}
				className={imgClass}
				style={style}
				draggable={false}
				decoding="async"
			/>
		);
	}
	return <BrandIcon src={fallbackSrc} size={displaySize} alt={alt} />;
}

export const CONNECTION_CHIP_ICON_SIZE = 22;

export function ConnectionIcon({ id, size = 18 }: { id: string; size?: number }) {
	switch (id) {
		case "agent":
		case "claude-code":
			return <BrandIcon src={BRAND_ICONS.claude} size={size} alt="Claude Code" />;
		case "codex":
			return <BrandIcon src={BRAND_ICONS.codex} size={size} alt="Codex" />;
		case "cursor":
		case "agent-cursor":
			return <BrandIcon src={BRAND_ICONS.cursor} size={size} alt="Cursor Agent" />;
		case "agent-codex":
			return <BrandIcon src={BRAND_ICONS.codex} size={size} alt="Codex" />;
		case "agent-claude-code":
			return <BrandIcon src={BRAND_ICONS.claude} size={size} alt="Claude Code" />;
		case "gmail":
			return <BrandIcon src={BRAND_ICONS.google} size={size} alt="Gmail" />;
		case "nango":
			return <Plug size={size} className="shrink-0 text-neutral-500" strokeWidth={1.75} />;
		case "office-github":
			return <Github size={size} className="shrink-0 text-neutral-700" strokeWidth={1.75} />;
		case "office-slack":
			return <BrandIcon src={BRAND_ICONS.slack} size={size} alt="Slack" />;
		case "office-feishu":
			return (
				<IntegrationBrandIcon id={id} fallbackSrc={BRAND_ICONS.feishu} alt="飞书" size={size} />
			);
		case "office-dingtalk":
			return (
				<IntegrationBrandIcon id={id} fallbackSrc={BRAND_ICONS.dingtalk} alt="钉钉" size={size} />
			);
		case "office-wecom":
			return (
				<IntegrationBrandIcon
					id={id}
					fallbackSrc={BRAND_ICONS.wecom}
					alt="企业微信"
					size={size}
					scale={1.18}
				/>
			);
		case "cdp":
			return <ChromeIcon size={size} />;
		case "screen":
			return <Monitor size={size} className="shrink-0 text-neutral-500" strokeWidth={1.75} />;
		case "uitars":
			return <BrandIcon src={BRAND_ICONS.bytedance} size={size} alt="UI-TARS" />;
		case "workbuddy":
			return <BrandIcon src={BRAND_ICONS.workbuddy} size={size} alt="Work Buddy" />;
		default:
			return <Bot size={size} className="shrink-0 text-neutral-400" strokeWidth={1.75} />;
	}
}
