const BAR_COUNT = 5;

interface Props {
	level: number;
	active?: boolean;
}

/** 真实音量驱动的音波条；静音时低幅度呼吸。 */
export function VoiceWave({ level, active = true }: Props) {
	const smooth = Math.max(0, Math.min(1, level));
	const idle = smooth < 0.05;

	return (
		<div className="fold-voice-wave" aria-hidden="true" data-active={active || undefined}>
			{Array.from({ length: BAR_COUNT }, (_, i) => {
				const phase = (i - (BAR_COUNT - 1) / 2) / ((BAR_COUNT - 1) / 2);
				const shape = 1 - Math.abs(phase) * 0.35;
				const height = idle
					? undefined
					: `${Math.round(6 + smooth * 22 * shape * (0.75 + (i % 2) * 0.25))}px`;
				return (
					<span
						key={i}
						className={`fold-voice-wave-bar${idle ? " is-idle" : ""}`}
						style={{
							height,
							animationDelay: idle ? `${i * 0.12}s` : undefined,
							opacity: idle ? undefined : 0.45 + smooth * 0.55,
						}}
					/>
				);
			})}
		</div>
	);
}
