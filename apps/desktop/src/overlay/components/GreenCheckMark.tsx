interface Props {
	/** working=填充中 · done=填满并对勾定格 */
	phase: "working" | "done";
}

/** 胶囊内左侧：绿色圆圈对勾（等待/完成共用）。 */
export function GreenCheckMark({ phase }: Props) {
	return (
		<div
			className={`fold-green-check${phase === "done" ? " is-done" : ""}`}
			aria-hidden="true"
		>
			<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
				<path
					d="M3.5 7.2L5.8 9.5L10.5 4.5"
					stroke="currentColor"
					strokeWidth="1.8"
					strokeLinecap="round"
					strokeLinejoin="round"
				/>
			</svg>
		</div>
	);
}
