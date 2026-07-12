import { useEffect, useState } from "react";
import { AppIconImg } from "./AppIcon.js";
import { ChromeIcon } from "./brand-icons.js";
import { faviconUrlForPage } from "../../lib/page-context.js";
import type { ContextTarget } from "../lib/context-targets.js";

function PageFavicon({ url, size }: { url: string; size: number }) {
	const [src, setSrc] = useState<string | null>(faviconUrlForPage(url));
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		setSrc(faviconUrlForPage(url));
		setFailed(false);
	}, [url]);

	if (!src || failed) {
		return <ChromeIcon size={size} />;
	}

	return (
		<img
			src={src}
			alt=""
			width={size}
			height={size}
			className="rounded-[22%] object-contain"
			draggable={false}
			onError={() => setFailed(true)}
		/>
	);
}

export function ContextTargetChip({
	target,
	onClick,
}: {
	target: ContextTarget;
	onClick: () => void;
}) {
	const label = target.kind === "app" ? target.appName : target.label;
	const subtitle =
		target.subtitle && target.subtitle !== label
			? target.subtitle.replace(/\s*[-·|]\s*Google Chrome$/i, "").trim()
			: null;

	return (
		<button type="button" className="fold-context-chip" onClick={onClick} title={subtitle ?? label}>
			<span className="fold-context-chip-icon" aria-hidden="true">
				{target.kind === "app" ? (
					<AppIconImg appPath={target.appPath} appName={target.appName} size={18} />
				) : (
					<PageFavicon url={target.url} size={18} />
				)}
			</span>
			<span className="fold-context-chip-copy">
				<strong>{label}</strong>
				{subtitle ? <small>{subtitle}</small> : null}
			</span>
		</button>
	);
}
