"use client";

import type { ReactNode } from "react";
import { motion } from "framer-motion";

export function HeroHighlight({ children }: { children: ReactNode }) {
	return (
		<div className="zg-hero-highlight">
			<div className="zg-hero-highlight-content">{children}</div>
		</div>
	);
}

export function Highlight({
	children,
	active,
	reduceMotion,
}: {
	children: ReactNode;
	active: boolean;
	reduceMotion: boolean;
}) {
	return (
		<span className="zg-highlight">
			<motion.span
				className="zg-highlight-mist"
				aria-hidden="true"
				initial={{ opacity: 0, scaleX: 0 }}
				animate={{ opacity: active ? 1 : 0, scaleX: active ? 1 : 0 }}
				transition={{
					duration: reduceMotion ? 0 : 1.1,
					ease: [0.4, 0, 0.2, 1],
				}}
			/>
			<span className="zg-highlight-text">{children}</span>
		</span>
	);
}
