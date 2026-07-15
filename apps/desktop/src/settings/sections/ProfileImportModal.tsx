import { BrandIcon, CHAT_PLATFORM_ICONS } from "../components/brand-icons.js";
import { useProfileImport } from "../hooks/useProfileImport.js";

export function ProfileImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
	const imp = useProfileImport();

	async function handleSave() {
		const profile = await imp.saveResponse();
		if (profile) {
			onSaved();
			onClose();
		}
	}

	return (
		<div className="fold-profile-import-backdrop" onClick={onClose} role="presentation">
			<div
				className="fold-profile-import-modal"
				onClick={(e) => e.stopPropagation()}
				role="dialog"
				aria-labelledby="profile-import-title"
			>
				<div className="fold-profile-import-head">
					<h2 id="profile-import-title" className="text-[15px] font-semibold text-[#1d1d1f]">
						从 AI 助手导入画像
					</h2>
					<button type="button" className="fold-profile-import-close" onClick={onClose} aria-label="关闭">
						×
					</button>
				</div>

				{imp.loading ? (
					<p className="text-[13px] text-[#86868b]">检测 Chrome 标签…</p>
				) : (
					<div className="space-y-4">
						<div>
							<p className="text-[12px] leading-relaxed text-[#86868b]">
								Fold 会生成「三层协作上下文」迁移 prompt，并附上本地任务摘要。AI 应返回完整档案，并在文末附带
								知更 Profile Appendix（JSON）供 Fold 写回简要画像。仅 ChatGPT / Claude 支持全自动填发，其他平台请复制后手动粘贴。
							</p>
						</div>

						<div>
							<p className="mb-2 text-[12px] font-medium text-[#1d1d1f]">选择平台</p>
							<div className="fold-profile-platform-grid">
								{imp.options.map((opt) => (
									<button
										key={opt.id}
										type="button"
										className={`fold-profile-platform-tile${imp.selectedId === opt.id ? " active" : ""}`}
										onClick={() => imp.setSelectedId(opt.id)}
									>
										<span className="fold-profile-platform-icon-wrap">
											<BrandIcon
												src={CHAT_PLATFORM_ICONS[opt.id] ?? CHAT_PLATFORM_ICONS.chatgpt!}
												size={32}
												alt={opt.label}
												className="fold-profile-platform-icon"
											/>
											{opt.hasOpenTab && (
												<span className="fold-profile-platform-dot" title="Chrome 已打开" />
											)}
										</span>
										<span className="fold-profile-platform-label">{opt.label}</span>
									</button>
								))}
							</div>
							{imp.selected && (
								<p className="mt-2 text-[11px] text-[#86868b]">
									{imp.selected.hasOpenTab
										? `将使用已开标签：${imp.selected.tabTitle ?? imp.selected.tabUrl}`
										: `将打开 ${imp.selected.defaultUrl}`}
									{imp.selected.automationSupported ? " · 支持全自动" : " · 请手动粘贴 prompt"}
								</p>
							)}
						</div>

						<div className="flex flex-wrap gap-2">
							<button type="button" className="fold-profile-action-btn secondary" onClick={() => void imp.copyPrompt()}>
								复制 prompt
							</button>
							{imp.selected?.automationSupported && (
								<button
									type="button"
									className="fold-profile-action-btn primary"
									disabled={imp.running || !imp.selectedId}
									onClick={() => void imp.runImport()}
								>
									{imp.running ? "等待 AI 回复…" : "自动填入并发送"}
								</button>
							)}
							{imp.selected && !imp.selected.hasOpenTab && (
								<button
									type="button"
									className="fold-profile-action-btn secondary"
									onClick={() => void window.fold.openExternal(imp.selected!.defaultUrl)}
								>
									在浏览器打开
								</button>
							)}
						</div>

						<label className="block space-y-1.5">
							<span className="text-[12px] font-medium text-[#1d1d1f]">AI 回复（可编辑）</span>
							<textarea
								className="fold-profile-response-input"
								rows={8}
								value={imp.responseText}
								onChange={(e) => imp.setResponseText(e.target.value)}
								placeholder="粘贴 AI 返回的完整档案（含文末 知更 Profile Appendix JSON）"
							/>
						</label>

						{imp.info && <p className="text-[12px] text-[#248a3d]">{imp.info}</p>}
						{imp.error && <p className="text-[12px] text-[#d70015]">{imp.error}</p>}

						<div className="flex justify-end gap-2 pt-1">
							<button type="button" className="fold-profile-action-btn secondary" onClick={onClose}>
								取消
							</button>
							<button
								type="button"
								className="fold-profile-action-btn primary"
								disabled={imp.saving}
								onClick={() => void handleSave()}
							>
								{imp.saving ? "保存中…" : "确认保存画像"}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
