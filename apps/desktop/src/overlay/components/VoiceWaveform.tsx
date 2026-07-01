import { useEffect, useRef, useState } from "react";
import { smoothAudioLevel } from "@fold/voice";

const BUFFER_LEN = 42;
const TICK_MS = 95;

interface Props {
	level: number;
	active?: boolean;
}

export function VoiceWaveform({ level, active = true }: Props) {
	const [buffer, setBuffer] = useState<number[]>(() => new Array(BUFFER_LEN).fill(0));
	const currentRef = useRef(0);

	useEffect(() => {
		if (!active) {
			setBuffer(new Array(BUFFER_LEN).fill(0));
			currentRef.current = 0;
			return;
		}
		const timer = setInterval(() => {
			const real = Math.max(0, Math.min(1, level));
			currentRef.current = smoothAudioLevel(currentRef.current, real);
			const gate = currentRef.current < 0.035 ? 0 : currentRef.current;
			const v = Math.max(0, Math.min(1, gate ** 0.72));
			setBuffer((prev) => [...prev.slice(1), v]);
		}, TICK_MS);
		return () => clearInterval(timer);
	}, [level, active]);

	return (
		<div
			className="flex items-center gap-[2px] h-5 w-16 shrink-0"
			style={{
				maskImage:
					"linear-gradient(to right, transparent, #000 16%, #000 84%, transparent)",
			}}
		>
			{buffer.map((v, i) => (
				<div
					key={i}
					className="flex-1 min-w-[2px] bg-white/80 rounded-full transition-[height] duration-70"
					style={{ height: `${Math.max(2, v * 100)}%` }}
				/>
			))}
		</div>
	);
}
