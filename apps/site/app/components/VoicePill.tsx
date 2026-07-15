"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Command, Mic } from "lucide-react";

const VOICE_BARS = [18, 30, 42, 56, 72, 88, 62, 46, 34, 24, 40, 54, 32] as const;

/**
 * 落地页用的知更语音胶囊：对应产品里长按 ⌘ 时的波形条。
 * active=true 时条跳动（正在听）；false 时保持短条空闲态，但仍可见。
 */
export function VoicePill({
	active = true,
	visible = true,
	label = "长按 ⌘ 口述",
}: {
	active?: boolean;
	visible?: boolean;
	label?: string;
}) {
	const reduce = Boolean(useReducedMotion());

	return (
		<motion.div
			className={`zg-voice-pill${active ? " is-active" : ""}`}
			aria-hidden={!visible}
			initial={{ opacity: 0, y: 12 }}
			animate={
				visible
					? { opacity: 1, y: reduce || !active ? 0 : [0, -6, 0] }
					: { opacity: 0, y: 12 }
			}
			transition={
				visible && active && !reduce
					? { opacity: { duration: 0.35 }, y: { duration: 2.8, repeat: Infinity, ease: "easeInOut" } }
					: { duration: 0.35 }
			}
		>
			<Mic size={16} />
			<div className="zg-bars">
				{VOICE_BARS.map((height, index) => (
					<motion.span
						key={`${height}-${index}`}
						style={{ height: active ? height : Math.max(8, Math.round(height * 0.28)) }}
						animate={reduce || !active ? {} : { scaleY: [0.4, 1, 0.55] }}
						transition={{
							duration: 0.85,
							repeat: Infinity,
							repeatType: "mirror",
							delay: index * 0.04,
						}}
					/>
				))}
			</div>
			<span className="zg-voice-pill-label">
				<Command size={14} />
				{label}
			</span>
		</motion.div>
	);
}
