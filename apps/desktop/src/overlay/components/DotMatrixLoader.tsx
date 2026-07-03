const DELAYS = [0, 0.12, 0.24, 0.08, 0.2, 0.32, 0.16, 0.28, 0.4];

export function DotMatrixLoader() {
	return (
		<div className="fold-dot-matrix" aria-hidden="true">
			{DELAYS.map((delay, index) => (
				<span key={index} style={{ animationDelay: `${delay}s` }} />
			))}
		</div>
	);
}
