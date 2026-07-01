export function FoldLogoMark({ size = 28, className = "" }: { size?: number; className?: string }) {
	return (
		<svg
			width={size}
			height={size * (28 / 32)}
			viewBox="0 0 32 28"
			fill="none"
			className={className}
			aria-hidden="true"
		>
			<path
				d="M6 7.5L16 18.5L26 7.5"
				stroke="currentColor"
				strokeWidth="8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}
