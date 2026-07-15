import { BrandIcon, CHAT_PLATFORM_ICONS } from "../../settings/components/brand-icons";
import { useProfileImport } from "../../settings/hooks/useProfileImport";
import {
	OnboardingPrimaryBtn,
	OnboardingSecondaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";

export function ProfileImportStep({
	onNext,
	onBack,
}: {
	onNext: () => void;
	onBack: () => void;
}) {
	const imp = useProfileImport();

	async function handleSave() {
		const profile = await imp.saveResponse();
		if (profile) onNext();
	}

	return (
		<OnboardingShell
			step="profile-import"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">让知更继承你在 AI 助手里的记忆</h1>
					<p className="fold-onboarding-sub">
						代回更像你说话，专名听得更准，Agent 少问废话。
					</p>
					{imp.loading ? (
						<p className="fold-onboarding-hint">检测 Chrome 标签…</p>
					) : (
						<div className="space-y-3">
							<div className="fold-profile-platform-grid">
								{imp.options.map((opt) => (
									<button
										key={opt.id}
										type="button"
										className={`fold-profile-platform-tile${imp.selectedId === opt.id ? " active" : ""}`}
										onClick={() => imp.setSelectedId(opt.id)}
									>
										<BrandIcon
											src={CHAT_PLATFORM_ICONS[opt.id] ?? CHAT_PLATFORM_ICONS.chatgpt!}
											size={28}
											alt={opt.label}
										/>
										<span className="fold-profile-platform-label">{opt.label}</span>
									</button>
								))}
							</div>
							<div className="flex flex-wrap gap-2">
								<OnboardingSecondaryBtn onClick={() => void imp.copyPrompt()}>
									复制 prompt
								</OnboardingSecondaryBtn>
								{imp.selected?.automationSupported ? (
									<OnboardingPrimaryBtn
										onClick={() => void imp.runImport()}
										disabled={imp.running}
									>
										{imp.running ? "等待 AI 回复…" : "自动填入并发送"}
									</OnboardingPrimaryBtn>
								) : null}
								{imp.selected && !imp.selected.hasOpenTab ? (
									<OnboardingSecondaryBtn
										onClick={() => void window.fold.openExternal(imp.selected!.defaultUrl)}
									>
										在浏览器打开
									</OnboardingSecondaryBtn>
								) : null}
							</div>
							<textarea
								className="fold-profile-response-input"
								rows={6}
								value={imp.responseText}
								onChange={(e) => imp.setResponseText(e.target.value)}
								placeholder="粘贴 AI 返回的完整档案（含文末 知更 Profile Appendix JSON）"
							/>
							{imp.info ? <p className="text-[12px] text-[#248a3d]">{imp.info}</p> : null}
							{imp.error ? <p className="fold-onboarding-error">{imp.error}</p> : null}
						</div>
					)}
				</>
			}
			right={
				<div className="fold-onboarding-visual-card">
					<ul className="fold-onboarding-checklist">
						<li>✓ 代回更像你说话</li>
						<li>✓ 「注意到了」更准</li>
						<li>✓ 识别你的人名、项目与术语</li>
					</ul>
				</div>
			}
			footer={
				<OnboardingPrimaryBtn onClick={() => void handleSave()} disabled={imp.saving}>
					{imp.saving ? "保存中…" : "确认保存画像"}
				</OnboardingPrimaryBtn>
			}
		/>
	);
}
