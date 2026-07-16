import { BrandIcon, CHAT_PLATFORM_ICONS } from "../../settings/components/brand-icons";
import { useProfileImport } from "../../settings/hooks/useProfileImport";
import { MARK_ASSET } from "../../brand/constants";
import {
	OnboardingPrimaryBtn,
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
			backdrop="memory"
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
							<p className="fold-onboarding-import-step">1 · 选择你最了解你的 AI 助手</p>
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
							<OnboardingPrimaryBtn
								className="fold-onboarding-import-open"
								onClick={() => void imp.copyPromptAndOpen()}
								disabled={!imp.selected}
							>
								复制 Prompt 并打开 {imp.selected?.label ?? "AI 助手"}
							</OnboardingPrimaryBtn>
							<p className="fold-onboarding-import-step">2 · 在 AI 中发送，再把完整回复粘贴回来</p>
							<textarea
								className="fold-profile-response-input"
								rows={6}
								value={imp.responseText}
								onChange={(e) => imp.setResponseText(e.target.value)}
								placeholder="在这里粘贴 AI 返回的完整内容…"
							/>
							{imp.info ? <p className="text-[12px] text-[#248a3d]">{imp.info}</p> : null}
							{imp.error ? <p className="fold-onboarding-error">{imp.error}</p> : null}
						</div>
					)}
				</>
			}
			right={
				<div className="fold-onboarding-memory-transfer">
					<p className="fold-onboarding-memory-eyebrow">把过去的你，带给知更</p>
					<div className="fold-onboarding-memory-flow">
						<div className="fold-onboarding-memory-source">
							<BrandIcon
								src={CHAT_PLATFORM_ICONS[imp.selectedId ?? ""] ?? CHAT_PLATFORM_ICONS.chatgpt!}
								size={36}
								alt={imp.selected?.label ?? "AI 助手"}
							/>
							<span>{imp.selected?.label ?? "AI 助手"}</span>
						</div>
						<div className="fold-onboarding-memory-stream" aria-hidden="true">
							<i />
							<i />
							<i />
						</div>
						<div className="fold-onboarding-memory-source is-zhigeng">
							<img src={MARK_ASSET} alt="" />
							<span>知更</span>
						</div>
					</div>
					<div className="fold-onboarding-memory-layers">
						<div><span>表达习惯</span><strong>更像你说话</strong></div>
						<div><span>人物与项目</span><strong>专有名词更准</strong></div>
						<div><span>工作上下文</span><strong>少重复解释</strong></div>
					</div>
					<p className="fold-onboarding-memory-privacy">只保存你确认导入的内容</p>
				</div>
			}
			footer={
				<OnboardingPrimaryBtn
					onClick={() => void handleSave()}
					disabled={imp.saving || !imp.responseText.trim()}
				>
					{imp.saving ? "保存中…" : "确认保存画像"}
				</OnboardingPrimaryBtn>
			}
		/>
	);
}
