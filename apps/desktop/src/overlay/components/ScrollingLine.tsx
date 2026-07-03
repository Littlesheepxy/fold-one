import { useLayoutEffect, useRef } from "react";

interface Props {
	text: string;
	className?: string;
	/** Voice transcript grows on the right; progress lines read from the start. */
	scrollAlign?: "start" | "end";
}

/** Single-line window; longer text scrolls horizontally. */
export function ScrollingLine({ text, className = "text-sm", scrollAlign = "start" }: Props) {
	const containerRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const container = containerRef.current;
		if (!container) return;
		container.scrollLeft = scrollAlign === "end" ? container.scrollWidth : 0;
	}, [text, scrollAlign]);

	return (
		<div ref={containerRef} className="fold-scrolling-line min-w-0 overflow-hidden">
			<span className={`inline-block whitespace-nowrap ${className}`}>{text}</span>
		</div>
	);
}
