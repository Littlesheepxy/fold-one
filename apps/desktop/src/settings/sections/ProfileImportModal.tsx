import { useEffect, useState } from "react";
import { BrandIcon, CHAT_PLATFORM_ICONS } from "../components/brand-icons.js";

export interface ProfileImportOption {
	id: string;
	label: string;
	hasOpenTab: boolean;
	tabUrl?: string;
	tabTitle?: string;
	defaultUrl: string;
	automationSupported: boolean;
}

const FALLBACK_PLATFORMS: ProfileImportOption[] = [
	{
		id: "chatgpt",
		label: "ChatGPT",
		hasOpenTab: false,
		defaultUrl: "https://chatgpt.com/",
		automationSupported: true,
	},
	{
		id: "claude",
		label: "Claude",
		hasOpenTab: false,
		defaultUrl: "https://claude.ai/new",
		automationSupported: true,
	},
	{
		id: "doubao",
		label: "豆包",
		hasOpenTab: false,
		defaultUrl: "https://www.doubao.com/chat/",
		automationSupported: false,
	},
	{
		id: "deepseek",
		label: "DeepSeek",
		hasOpenTab: false,
		defaultUrl: "https://chat.deepseek.com/",
		automationSupported: false,
	},
	{
		id: "tongyi",
		label: "通义千问",
		hasOpenTab: false,
		defaultUrl: "https://tongyi.aliyun.com/qianwen/",
		automationSupported: false,
	},
	{
		id: "kimi",
		label: "Kimi",
		hasOpenTab: false,
		defaultUrl: "https://kimi.moonshot.cn/",
		automationSupported: false,
	},
];

export function ProfileImportModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
	const [options, setOptions] = useState<ProfileImportOption[]>([]);
	const [prompt, setPrompt] = useState("");
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [responseText, setResponseText] = useState("");
	const [loading, setLoading] = useState(true);
	const [running, setRunning] = useState(false);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);
	const [showPrompt, setShowPrompt] = useState(false);

	useEffect(() => {
		let mounted = true;
		setLoading(true);
		void Promise.all([window.fold.profileImportOptions(), window.fold.profileBuildPrompt()])
			.then(([opts, p]) => {
				if (!mounted) return;
				const platforms = opts.length > 0 ? opts : FALLBACK_PLATFORMS;
				setOptions(platforms);
				setPrompt(p);
				const preferred =
					platforms.find((o) => o.hasOpenTab && o.automationSupported) ??
					platforms.find((o) => o.hasOpenTab) ??
					platforms[0];
				if (preferred) setSelectedId(preferred.id);
			})
			.catch(() => {
				if (!mounted) return;
				setOptions(FALLBACK_PLATFORMS);
				setSelectedId(FALLBACK_PLATFORMS[0]?.id ?? null);
			})
			.finally(() => {
				if (mounted) setLoading(false);
			});
		return () => {
			mounted = false;
		};
	}, []);

	const selected = options.find((o) => o.id === selectedId);

	async function handleCopyPrompt() {
		setError(null);
		const { prompt: copied } = await window.fold.profileCopyPrompt();
		setPrompt(copied);
		setInfo("已复制 prompt 到剪贴板");
	}

	async function handleRunImport() {
		if (!selectedId) return;
		setRunning(true);
		setError(null);
		setInfo(null);
		try {
			const result = await window.fold.profileRunImport(selectedId, selected?.tabUrl);
			if (result.response) {
				setResponseText(result.response);
				setInfo("已收到 AI 回复，请确认后保存");
			} else if (!result.ok) {
				setError(result.error ?? "自动化失败");
				if (result.prompt) setPrompt(result.prompt);
			}
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setRunning(false);
		}
	}

	async function handleSave() {
		if (!responseText.trim()) {
			setError("请粘贴或等待 AI 回复");
			return;
		}
		setSaving(true);
		setError(null);
		try {
			const result = await window.fold.profileSaveResponse(responseText);
			if (!result.ok) {
				setError(result.error ?? "保存失败");
				return;
			}
			onSaved();
			onClose();
		} catch (err) {
			setError((err as Error).message);
		} finally {
			setSaving(false);
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

				{loading ? (
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
								{options.map((opt) => (
									<button
										key={opt.id}
										type="button"
										className={`fold-profile-platform-tile${selectedId === opt.id ? " active" : ""}`}
										onClick={() => setSelectedId(opt.id)}
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
							{selected && (
								<p className="mt-2 text-[11px] text-[#86868b]">
									{selected.hasOpenTab
										? `将使用已开标签：${selected.tabTitle ?? selected.tabUrl}`
										: `将打开 ${selected.defaultUrl}`}
									{selected.automationSupported ? " · 支持全自动" : " · 请手动粘贴 prompt"}
								</p>
							)}
						</div>

						<div>
							<button
								type="button"
								className="fold-home-link text-[12px]"
								onClick={() => setShowPrompt((v) => !v)}
							>
								{showPrompt ? "隐藏" : "预览"}将发送的 prompt
							</button>
							{showPrompt && (
								<pre className="fold-profile-prompt-preview">{prompt}</pre>
							)}
						</div>

						<div className="flex flex-wrap gap-2">
							<button type="button" className="fold-profile-action-btn secondary" onClick={() => void handleCopyPrompt()}>
								复制 prompt
							</button>
							{selected?.automationSupported && (
								<button
									type="button"
									className="fold-profile-action-btn primary"
									disabled={running || !selectedId}
									onClick={() => void handleRunImport()}
								>
									{running ? "等待 AI 回复…" : "自动填入并发送"}
								</button>
							)}
							{selected && !selected.hasOpenTab && (
								<button
									type="button"
									className="fold-profile-action-btn secondary"
									onClick={() => void window.fold.openExternal(selected.defaultUrl)}
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
								value={responseText}
								onChange={(e) => setResponseText(e.target.value)}
								placeholder="粘贴 AI 返回的完整档案（含文末 知更 Profile Appendix JSON）"
							/>
						</label>

						{info && <p className="text-[12px] text-[#248a3d]">{info}</p>}
						{error && <p className="text-[12px] text-[#d70015]">{error}</p>}

						<div className="flex justify-end gap-2 pt-1">
							<button type="button" className="fold-profile-action-btn secondary" onClick={onClose}>
								取消
							</button>
							<button
								type="button"
								className="fold-profile-action-btn primary"
								disabled={saving}
								onClick={() => void handleSave()}
							>
								{saving ? "保存中…" : "确认保存画像"}
							</button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
