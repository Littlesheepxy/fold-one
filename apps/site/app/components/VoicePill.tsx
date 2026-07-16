"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { Check, X } from "lucide-react";

/** 对齐桌面端 VoiceWave：9 根细条 + 分层振幅轮廓 */
const BAR_COUNT = 9;
const BAR_PROFILE = [0.34, 0.5, 0.72, 0.9, 1, 0.9, 0.72, 0.5, 0.34];
const BAR_PHASE = [0.3, 2.1, 4.4, 1.2, 3.5, 5.2, 2.8, 0.8, 4.9];
const IDLE_H = 3;
const MAX_H = 18;

export type VoicePillState = "hidden" | "listening" | "processing" | "done";

/**
 * 落地页语音胶囊，对齐产品 fold-input-tab 的三态：
 * listening（图标 + 转写 + 波形 + 关闭）→ processing（加载）→ done（绿色对勾）。
 */
export function VoicePill({
	state,
	appLogo = "/brand/icons/feishu.svg",
	label = "转写",
}: {
	state: VoicePillState;
	appLogo?: string;
	label?: string;
}) {
	const reduce = Boolean(useReducedMotion());
	const listening = state === "listening";
	const [heights, setHeights] = useState(() => Array.from({ length: BAR_COUNT }, () => IDLE_H));
	const [barOpacity, setBarOpacity] = useState(0.48);
	const levelRef = useRef(0);

	useEffect(() => {
		if (reduce || !listening) {
			setHeights(Array.from({ length: BAR_COUNT }, () => IDLE_H));
			setBarOpacity(0.48);
			return;
		}

		let raf = 0;
		let start = 0;
		const tick = (now: number) => {
			if (!start) start = now;
			const t = now - start;
			// 模拟说话音量包络：起伏 + 偶尔停顿，让波形像真的在听人说话
			const talk = 0.5 + 0.5 * Math.sin(t * 0.0042);
			const pause = Math.sin(t * 0.0009) > -0.55 ? 1 : 0.12;
			const envelope = (0.3 + 0.65 * talk) * pause;
			levelRef.current += (envelope - levelRef.current) * 0.12;
			const energy = Math.pow(Math.max(0, levelRef.current), 0.72);

			setHeights(
				BAR_PROFILE.map((profile, i) => {
					const pulse = 0.72 + 0.28 * Math.sin(now * (0.0075 + (i % 3) * 0.0014) + BAR_PHASE[i]!);
					return Math.round(IDLE_H + energy * MAX_H * profile * pulse);
				}),
			);
			setBarOpacity(0.62 + energy * 0.38);
			raf = requestAnimationFrame(tick);
		};

		raf = requestAnimationFrame(tick);
		return () => cancelAnimationFrame(raf);
	}, [listening, reduce]);

	return (
		<motion.div
			layout
			className={`zg-voice-pill zg-voice-pill--${state}`}
			aria-hidden={state === "hidden"}
			initial={{ opacity: 0, y: 8 }}
			animate={
				state === "hidden"
					? { opacity: 0, y: 8 }
					: { opacity: 1, y: listening && !reduce ? [0, -4, 0] : 0 }
			}
			transition={
				listening && !reduce
					? { layout: { duration: 0.28 }, opacity: { duration: 0.3 }, y: { duration: 2.6, repeat: Infinity, ease: "easeInOut" } }
					: { layout: { duration: 0.28 }, duration: 0.3 }
			}
		>
			{listening && (
				<>
					<img className="zg-voice-pill-app" src={appLogo} alt="" width={18} height={18} />
					<span className="zg-voice-pill-mode">{label}</span>
					<span className="zg-voice-pill-sep" aria-hidden="true" />
					<div className="zg-bars" aria-hidden="true">
						{heights.map((height, i) => (
							<span key={i} style={{ height, opacity: barOpacity }} />
						))}
					</div>
					<span className="zg-voice-pill-close" aria-hidden="true">
						<X size={13} strokeWidth={2.2} />
					</span>
				</>
			)}
			{state === "processing" && <span className="zg-voice-pill-spinner" aria-hidden="true" />}
			{state === "done" && (
				<span className="zg-voice-pill-check" aria-hidden="true">
					<Check size={13} strokeWidth={2.6} />
				</span>
			)}
		</motion.div>
	);
}
