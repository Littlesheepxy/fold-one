import { useLayoutEffect, useRef } from "react";

interface Props {
	text: string;
	placeholder?: string;
}

/** Fixed subtitle window; newer text stays visible on the right. */
export function TranscriptScroll({ text, placeholder = "正在听…" }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);
	const display = text || placeholder;

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		container.scrollLeft = container.scrollWidth;
	}, [display]);

	return (
		<div
			ref={containerRef}
			className="flex-1 min-w-0 max-w-[210px] overflow-hidden"
		>
			<span className="text-sm inline-block whitespace-nowrap">{display}</span>
		</div>
	);
}
