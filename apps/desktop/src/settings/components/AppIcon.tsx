import { useEffect, useState } from "react";

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
		});
		return () => {
			cancelled = true;
		};
	}, [appPath, appName]);

	return icon;
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
	return (
		<span
			style={{ width: size, height: size, fontSize: size * 0.5 }}
			className="grid shrink-0 place-items-center rounded-[28%] bg-[#e8e8ed] font-semibold text-[#6e6e73]"
		>
			{(appName ?? "?").slice(0, 1).toUpperCase()}
		</span>
	);
}
