import {
	FOLD_MARK_PATH,
	FOLD_MARK_STROKE_WIDTH,
	FOLD_MARK_VIEWBOX,
} from "../brand/mark.js";

export function FoldLogoMark({
	size,
	className = "",
}: {
	/** 未指定时由 className / 外层 CSS 控制尺寸（如悬浮球） */
	size?: number;
	className?: string;
}) {
	const aspect = FOLD_MARK_VIEWBOX.height / FOLD_MARK_VIEWBOX.width;
	return (
		<svg
			width={size}
			height={size ? Math.round(size * aspect) : undefined}
			viewBox={`0 0 ${FOLD_MARK_VIEWBOX.width} ${FOLD_MARK_VIEWBOX.height}`}
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d={FOLD_MARK_PATH}
				stroke="currentColor"
				strokeWidth={FOLD_MARK_STROKE_WIDTH}
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
