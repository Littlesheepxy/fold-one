import { useEffect, useState } from "react";
import { faviconUrlForPage } from "../../lib/page-context.js";

export function ContextAppIcon({
	appPath,
	appName,
	pageUrl,
	size = 20,
	className = "shrink-0 rounded-[22%]",
}: {
	appPath?: string | null;
	appName?: string | null;
	pageUrl?: string | null;
	size?: number;
	className?: string;
}) {
	const [icon, setIcon] = useState<string | null>(null);

	useEffect(() => {
		const favicon = pageUrl?.startsWith("http") ? faviconUrlForPage(pageUrl) : null;
		if (favicon) {
			setIcon(favicon);
			return;
		}
		if (!appName && !appPath) {
			setIcon(null);
			return;
		}
		let cancelled = false;
		void window.fold.getAppIcon(appPath ?? "", appName ?? undefined).then((dataUrl) => {
			if (!cancelled) setIcon(dataUrl);
		});
		return () => {
			cancelled = true;
		};
	}, [appPath, appName, pageUrl]);

	if (icon) {
		return <img src={icon} alt="" width={size} height={size} className={className} draggable={false} />;
	}

	return (
		<span
			style={{ width: size, height: size, fontSize: size * 0.48 }}
			className={`grid place-items-center rounded-[22%] bg-white/12 font-semibold text-white/85 ${className ?? ""}`}
			aria-hidden="true"
		>
			{(appName ?? "?").slice(0, 1).toUpperCase()}
		</span>
	);
}
