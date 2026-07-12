import { motion } from "framer-motion";
import { VoiceWave } from "../components/VoiceWave.js";

interface Placement {
	left: number;
	top: number;
}

interface Props {
	placement: Placement | null;
	text: string;
	voiceLevel: number;
}

export function InputSurface({ placement, text, voiceLevel }: Props) {
	const anchor = placement ?? {
		left: typeof window !== "undefined" ? window.innerWidth / 2 : 0,
		top: typeof window !== "undefined" ? window.innerHeight - 120 : 0,
	};

	return (
		<motion.div
			className="zh-input-surface-anchor pointer-events-auto"
			initial={{ opacity: 0, y: 8 }}
			animate={{ opacity: 1, y: 0 }}
			exit={{ opacity: 0, y: 6 }}
			transition={{ type: "spring", stiffness: 480, damping: 38, mass: 0.7 }}
			style={{
				left: anchor.left,
				top: anchor.top,
				transform: "translateX(-50%)",
			}}
		>
			<div className="zh-input-surface">
				<VoiceWave level={voiceLevel} />
				<p className="zh-input-surface-text">{text || "…"}</p>
			</div>
		</motion.div>
	);
}
