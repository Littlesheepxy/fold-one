import { useState } from "react";
import {
	OnboardingPrimaryBtn,
	OnboardingSecondaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";

/**
 * 轻量词源采集：职业/领域 + 中文输入法热词 + 英文专名。
 * 可跳过；跳过则热词表空，引擎 bias / 后处理都没有原料。
 */
export function KnowYouStep({
	onNext,
	onBack,
}: {
	onNext: () => void;
	onBack: () => void;
}) {
	const [role, setRole] = useState("");
	const [domains, setDomains] = useState("");
	const [keywords, setKeywords] = useState("");
	const [imeNote, setImeNote] = useState<string | null>(null);
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	async function importIme() {
		setBusy(true);
		setError(null);
		try {
			const report = (await window.fold.importInputHabits()) as {
				entryCount?: number;
			};
			const n = report.entryCount ?? 0;
			setImeNote(n > 0 ? `已导入 ${n} 条输入法词` : "未读到可用词库，可稍后在设置里再试");
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	async function saveAndContinue() {
		setBusy(true);
		setError(null);
		try {
			await window.fold.profileSaveSeed({
				role: role.trim() || undefined,
				domains: domains.trim() ? [domains] : undefined,
				keywords: keywords.trim() ? [keywords] : undefined,
			});
			onNext();
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setBusy(false);
		}
	}

	return (
		<OnboardingShell
			step="know-you"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">让语音听懂你的词</h1>
					<p className="fold-onboarding-sub">
						职业与专名会进入热词表（中英文都支持）。可跳过，之后在设置里补。
					</p>
					<div className="space-y-3">
						<label className="block space-y-1">
							<span className="text-[12px] text-[#86868b]">你的角色 / 职业</span>
							<input
								className="fold-profile-response-input"
								value={role}
								onChange={(e) => setRole(e.target.value)}
								placeholder="例如：AI 早期投资经理"
							/>
						</label>
						<label className="block space-y-1">
							<span className="text-[12px] text-[#86868b]">领域（逗号分隔）</span>
							<input
								className="fold-profile-response-input"
								value={domains}
								onChange={(e) => setDomains(e.target.value)}
								placeholder="例如：一级市场, Agent, 语音交互"
							/>
						</label>
						<label className="block space-y-1">
							<span className="text-[12px] text-[#86868b]">英文 / 产品专名（逗号分隔）</span>
							<input
								className="fold-profile-response-input"
								value={keywords}
								onChange={(e) => setKeywords(e.target.value)}
								placeholder="例如：InputSurface, Fast Path, ARR"
							/>
						</label>
						<OnboardingSecondaryBtn disabled={busy} onClick={() => void importIme()}>
							一键导入中文输入法热词
						</OnboardingSecondaryBtn>
						{imeNote ? <p className="text-[12px] text-[#248a3d]">{imeNote}</p> : null}
						{error ? <p className="fold-onboarding-error">{error}</p> : null}
						<div className="flex gap-2 pt-2">
							<OnboardingPrimaryBtn disabled={busy} onClick={() => void saveAndContinue()}>
								保存并继续
							</OnboardingPrimaryBtn>
							<OnboardingSecondaryBtn disabled={busy} onClick={onNext}>
								跳过
							</OnboardingSecondaryBtn>
						</div>
					</div>
				</>
			}
			right={
				<div className="fold-onboarding-memory-transfer">
					<p className="fold-onboarding-memory-eyebrow">热词怎么用</p>
					<ul className="space-y-2 text-[13px] text-[#1d1d1f]">
						<li>中文：输入法词库 + 职业领域</li>
						<li>英文：产品名、缩写、驼峰专名</li>
						<li>Pro / 试用会下发到云端识别引擎</li>
					</ul>
				</div>
			}
		/>
	);
}
