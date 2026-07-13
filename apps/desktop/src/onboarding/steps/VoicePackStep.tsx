import { useEffect, useState } from "react";
import {
	OnboardingPrimaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";

export function VoicePackStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
	const [setup, setSetup] = useState<Awaited<ReturnType<typeof window.fold.getVoiceSetup>> | null>(null);
	const [downloading, setDownloading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		void window.fold.getVoiceSetup().then(setSetup);
	}, []);

	async function download() {
		setDownloading(true);
		setError(null);
		const result = await window.fold.downloadVoicePack();
		setDownloading(false);
		if (!result.ok) {
			setError(result.error);
			return;
		}
		void window.fold.getVoiceSetup().then(setSetup);
	}

	return (
		<OnboardingShell
			step="voice-pack"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">语音包</h1>
					<p className="fold-onboarding-sub">{setup?.detail ?? "正在检测语音识别…"}</p>
					{setup?.mode === "download-needed" ? (
						<p className="fold-onboarding-hint">
							约 {setup.downloadSizeMb ?? 470} MB，下载一次即可离线使用。可后台继续引导。
						</p>
					) : null}
					{error ? <p className="fold-onboarding-error">{error}</p> : null}
				</>
			}
			right={
				<div className="fold-onboarding-visual-card">
					<p className="text-[14px] font-medium">{setup?.title ?? "检测中"}</p>
					<p className="mt-1 text-[12px] text-[#86868b]">
						{setup?.ready ? "语音已就绪" : "免费版使用本地语音识别"}
					</p>
				</div>
			}
			footer={
				<>
					{setup?.mode === "download-needed" && !setup.ready ? (
						<OnboardingPrimaryBtn onClick={() => void download()} disabled={downloading}>
							{downloading ? "下载中…" : "下载语音包"}
						</OnboardingPrimaryBtn>
					) : null}
					<OnboardingPrimaryBtn onClick={onNext}>继续</OnboardingPrimaryBtn>
				</>
			}
		/>
	);
}
