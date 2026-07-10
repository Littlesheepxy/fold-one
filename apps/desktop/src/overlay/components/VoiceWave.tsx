import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 9;
const BAR_PROFILE = [0.34, 0.5, 0.72, 0.9, 1, 0.9, 0.72, 0.5, 0.34];
const BAR_PHASE = [0.3, 2.1, 4.4, 1.2, 3.5, 5.2, 2.8, 0.8, 4.9];
const INPUT_OPEN = 0.16;
const INPUT_CLOSE = 0.09;
const SILENCE_LEVEL = 0.008;
const OPEN_FRAMES = 2;
const CLOSE_FRAMES = 6;

interface Props {
	level: number;
	active?: boolean;
}

/** 真实音量驱动的分层音波；静音时保持完全静止。 */
export function VoiceWave({ level, active = true }: Props) {
	const targetRef = useRef(0);
	const envelopeRef = useRef(0);
	const lastFrameRef = useRef(0);
	const speakingRef = useRef(false);
	const aboveCountRef = useRef(0);
	const belowCountRef = useRef(0);
	const [frame, setFrame] = useState({ level: 0, time: 0 });

	useEffect(() => {
		const raw = active ? Math.max(0, Math.min(1, level)) : 0;
		if (raw > INPUT_OPEN) {
			aboveCountRef.current += 1;
			belowCountRef.current = 0;
			if (aboveCountRef.current >= OPEN_FRAMES) speakingRef.current = true;
		} else if (raw < INPUT_CLOSE) {
			belowCountRef.current += 1;
			aboveCountRef.current = 0;
			if (belowCountRef.current >= CLOSE_FRAMES) speakingRef.current = false;
		}

		targetRef.current = speakingRef.current
			? (raw - INPUT_CLOSE) / (1 - INPUT_CLOSE)
			: 0;
	}, [active, level]);

	useEffect(() => {
		let animationFrame = 0;
		const update = (now: number) => {
			const previous = lastFrameRef.current || now;
			const dt = Math.min(48, now - previous);
			lastFrameRef.current = now;
			const target = targetRef.current;
			const current = envelopeRef.current;
			const timeConstant = target > current ? 55 : 120;
			const alpha = 1 - Math.exp(-dt / timeConstant);
			let next = current + (target - current) * alpha;
			if (target <= SILENCE_LEVEL && next < SILENCE_LEVEL) next = 0;
			envelopeRef.current = next;

			const speaking = speakingRef.current && next > SILENCE_LEVEL;
			if (speaking) {
				setFrame({ level: next, time: now });
			} else if (current > SILENCE_LEVEL) {
				setFrame({ level: 0, time: 0 });
			}
			animationFrame = requestAnimationFrame(update);
		};
		animationFrame = requestAnimationFrame(update);
		return () => cancelAnimationFrame(animationFrame);
	}, []);

	const idle = !active || frame.level <= SILENCE_LEVEL;
	const energy = idle ? 0 : Math.pow(frame.level, 0.72);

	return (
		<div className="fold-voice-wave" aria-hidden="true" data-active={active || undefined}>
			{Array.from({ length: BAR_COUNT }, (_, i) => {
				const pulse =
					0.72 +
					0.28 *
						Math.sin(frame.time * (0.0075 + (i % 3) * 0.0014) + BAR_PHASE[i]);
				const height = idle
					? 3
					: Math.round(3 + energy * 18 * BAR_PROFILE[i] * pulse);
				return (
					<span
						key={i}
						className="fold-voice-wave-bar"
						style={{
							height: `${height}px`,
							opacity: idle ? 0.48 : 0.62 + energy * 0.38,
						}}
					/>
				);
			})}
		</div>
	);
}
