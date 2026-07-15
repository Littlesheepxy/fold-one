"use client";

import type { ReactNode } from "react";
import { motion, useMotionTemplate, useMotionValue } from "framer-motion";

export function HeroHighlight({ children }: { children: ReactNode }) {
	const mouseX = useMotionValue(0);
	const mouseY = useMotionValue(0);
	const maskImage = useMotionTemplate`radial-gradient(220px circle at ${mouseX}px ${mouseY}px, black 0%, transparent 100%)`;

	return (
		<div
			className="zg-hero-highlight"
			onMouseMove={(event) => {
				const bounds = event.currentTarget.getBoundingClientRect();
				mouseX.set(event.clientX - bounds.left);
				mouseY.set(event.clientY - bounds.top);
			}}
		>
			<div className="zg-hero-dots" aria-hidden="true" />
			<motion.div
				className="zg-hero-dots zg-hero-dots-active"
				aria-hidden="true"
				style={{ maskImage, WebkitMaskImage: maskImage }}
			/>
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
