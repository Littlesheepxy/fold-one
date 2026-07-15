import { useEffect, useState } from "react";
import { BRAND_ICONS, BrandIcon } from "./brand-icons.js";

const iconRequests = new Map<string, Promise<string | null>>();

function iconCacheKey(appPath?: string | null, appName?: string | null) {
	if (appPath?.endsWith(".app")) return appPath;
	if (appName) return `name:${appName}`;
	return null;
}

function useAppIcon(appPath?: string | null, appName?: string | null) {
	const [icon, setIcon] = useState<string | null>(null);

	useEffect(() => {
		const key = iconCacheKey(appPath, appName);
		if (!key) {
			setIcon(null);
			return;
		}
		let cancelled = false;
		let request = iconRequests.get(key);
		if (!request) {
			request = window.fold.getAppIcon(appPath ?? "", appName ?? undefined);
			iconRequests.set(key, request);
		}
		void request.then((v) => {
			if (!cancelled) setIcon(v);
			// 失败的结果不长期占用去重缓存，避免一次瞬时失败让图标在整个窗口生命周期内消失
			if (!v && iconRequests.get(key) === request) iconRequests.delete(key);
		});
		return () => {
			cancelled = true;
		};
	}, [appPath, appName]);

	return icon;
}

function fallbackBrandIcon(appName?: string | null): string | null {
	const name = appName ?? "";
	if (/codex/i.test(name)) return BRAND_ICONS.codex;
	if (/claude/i.test(name)) return BRAND_ICONS.claude;
	if (/cursor/i.test(name)) return BRAND_ICONS.cursor;
	return null;
}

export function AppIconImg({
	appPath,
	appName,
	size,
}: {
	appPath?: string | null;
	appName?: string | null;
	size: number;
}) {
	const icon = useAppIcon(appPath, appName);
	if (icon) {
		return <img src={icon} alt="" style={{ width: size, height: size }} className="shrink-0" />;
	}
	const brandIcon = fallbackBrandIcon(appName);
	if (brandIcon) {
		return <BrandIcon src={brandIcon} size={size} />;
	}
	return (
		<span
			style={{ width: size, height: size, fontSize: size * 0.5 }}
			className="grid shrink-0 place-items-center rounded-[28%] bg-[#e8e8ed] font-semibold text-[#6e6e73]"
		>
			{(appName ?? "?").slice(0, 1).toUpperCase()}
		</span>
	);
}
