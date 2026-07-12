import { motion } from "framer-motion";
import type { ResolvedThought, ThoughtPhase } from "@fold/runtime";

interface Placement {
	left: number;
	top: number;
}

interface Props {
	placement: Placement | null;
	phase: ThoughtPhase;
	thought: ResolvedThought | null;
	readyLine?: string | null;
	handoffLine?: string | null;
}

function displayLine(
	phase: ThoughtPhase,
	thought: ResolvedThought | null,
	readyLine?: string | null,
	handoffLine?: string | null,
): string | null {
	if (phase === "handoff" && handoffLine) return handoffLine;
	if (phase === "ready" && readyLine) return readyLine;
	if (thought?.insight) {
		const prefix = phase === "ready" || phase === "handoff" ? "✓ " : "✦ ";
		return `${prefix}${thought.insight}`;
	}
	return null;
}

export function ThoughtSurface({
	placement,
	phase,
	thought,
	readyLine,
	handoffLine,
}: Props) {
	const line = displayLine(phase, thought, readyLine, handoffLine);
	if (!line) return null;

	const anchor = placement ?? {
		left: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
		top: 12,
	};

	return (
		<motion.div
			className="zh-thought-surface-anchor pointer-events-auto"
			initial={{ opacity: 0, scaleX: 0.88 }}
			animate={{ opacity: 1, scaleX: 1 }}
			exit={{ opacity: 0, scaleX: 0.92 }}
			transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.65 }}
			style={{
				left: anchor.left,
				top: anchor.top,
				transform: "translateX(-50%)",
			}}
		>
			<div className="zh-thought-surface" data-phase={phase}>
				<span className="zh-thought-surface-mist" aria-hidden="true" />
				<p className="zh-thought-surface-line">{line}</p>
			</div>
		</motion.div>
	);
}
