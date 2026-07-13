import { useEffect, useRef, useState } from "react";
import {
	OnboardingPrimaryBtn,
	OnboardingSecondaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";

export function SetupMicrophoneStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
	const [level, setLevel] = useState(0);
	const [heard, setHeard] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const streamRef = useRef<MediaStream | null>(null);
	const rafRef = useRef<number | null>(null);

	useEffect(() => {
		let audioCtx: AudioContext | null = null;
		let analyser: AnalyserNode | null = null;
		const data = new Uint8Array(32);

		void navigator.mediaDevices
			.getUserMedia({ audio: true })
			.then((stream) => {
				streamRef.current = stream;
				audioCtx = new AudioContext();
				analyser = audioCtx.createAnalyser();
				analyser.fftSize = 64;
				const source = audioCtx.createMediaStreamSource(stream);
				source.connect(analyser);
				const tick = () => {
					if (!analyser) return;
					analyser.getByteFrequencyData(data);
					const avg = data.reduce((a, b) => a + b, 0) / data.length / 255;
					setLevel(avg);
					if (avg > 0.08) setHeard(true);
					rafRef.current = requestAnimationFrame(tick);
				};
				tick();
			})
			.catch((err) => setError((err as Error).message));

		return () => {
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
			streamRef.current?.getTracks().forEach((t) => t.stop());
			void audioCtx?.close();
		};
	}, []);

	const bars = Array.from({ length: 14 }, (_, i) => {
		const active = level * 14 > i;
		return (
			<span key={i} className={`fold-onboarding-mic-bar${active ? " active" : ""}`} />
		);
	});

	return (
		<OnboardingShell
			step="microphone"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">口述以测试您的麦克风</h1>
					<p className="fold-onboarding-sub">您计算机内置的麦克风将确保最佳的转录效果。</p>
					<p className="fold-onboarding-hint">您在说话时看到蓝色条形图在移动吗？</p>
					{error ? <p className="fold-onboarding-error">{error}</p> : null}
				</>
			}
			right={
				<div className="fold-onboarding-mic-visual">
					<div className="fold-onboarding-mic-bars">{bars}</div>
				</div>
			}
			footer={
				<>
					<OnboardingSecondaryBtn onClick={onNext}>不，换个麦克风</OnboardingSecondaryBtn>
					<OnboardingPrimaryBtn onClick={onNext} disabled={!heard && !error}>
						是的，继续
					</OnboardingPrimaryBtn>
				</>
			}
		/>
	);
}
