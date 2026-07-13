import { useEffect, useState } from "react";
import { Keyboard, Mic } from "lucide-react";
import type { FoldConfig } from "../types.js";
import { BooleanField, ConnectionBadge, Field, StatusDot } from "../components/FormFields.js";
import { InputHabitScannerPanel } from "./InputHabitScannerPanel.js";

type VoiceSetup = Awaited<ReturnType<typeof window.fold.getVoiceSetup>>;

function SettingsGroup({
	icon,
	title,
	children,
}: {
	icon: React.ReactNode;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<div className="fold-home-group">
			<div className="fold-home-group-head">
				<div className="fold-home-icon-tile">{icon}</div>
				<span className="fold-home-group-title">{title}</span>
			</div>
			<div className="space-y-4">{children}</div>
		</div>
	);
}

function ShortcutRow({
	title,
	description,
	keys,
}: {
	title: string;
	description: string;
	keys: string[];
}) {
	return (
		<div className="fold-home-setting-row">
			<div className="fold-home-setting-copy">
				<span className="fold-home-setting-row-title">{title}</span>
				<span className="fold-home-setting-row-desc">{description}</span>
			</div>
			<div className="fold-home-kbd-group" aria-label={`快捷键：${keys.join(" ")}`}>
				{keys.map((key) => (
					<kbd key={key} className="fold-home-kbd">
						{key}
					</kbd>
				))}
			</div>
		</div>
	);
}

export function SettingsSection({
	config,
	saved,
	onUpdate,
	onUpdateBoolean,
	onSave,
	onPersistBoolean,
}: {
	config: FoldConfig;
	saved: boolean;
	onUpdate: (key: keyof FoldConfig, value: string) => void;
	onUpdateBoolean: (key: keyof FoldConfig, value: boolean) => void;
	onSave: () => void;
	onPersistBoolean: (key: keyof FoldConfig, value: boolean) => Promise<void>;
}) {
	const [voiceSetup, setVoiceSetup] = useState<VoiceSetup | null>(null);
	const [downloading, setDownloading] = useState(false);
	const [downloadError, setDownloadError] = useState<string | null>(null);
	const [advancedOpen, setAdvancedOpen] = useState(false);

	const planTier = config.planTier ?? "free";

	const refreshVoiceSetup = () => {
		void window.fold.getVoiceSetup().then(setVoiceSetup);
	};

	useEffect(() => {
		refreshVoiceSetup();
	}, [planTier, saved]);

	const handleDownloadVoicePack = async () => {
		setDownloading(true);
		setDownloadError(null);
		const result = await window.fold.downloadVoicePack();
		setDownloading(false);
		if (result.ok) {
			refreshVoiceSetup();
			return;
		}
		setDownloadError(result.error);
	};

	const voiceStatus =
		voiceSetup?.mode === "cloud"
			? "ok"
			: voiceSetup?.ready
				? "ok"
				: voiceSetup?.mode === "download-needed"
					? "warn"
					: "error";

	return (
		<div className="space-y-5">
			<div>
				<h1 className="fold-home-page-title">设置</h1>
				<p className="fold-home-page-subtitle">快捷键、语音与应用行为</p>
			</div>

			<SettingsGroup icon={<Keyboard size={18} strokeWidth={1.75} />} title="键盘快捷键">
				<div className="fold-home-settings-panel">
					<ShortcutRow
						title="转写"
						description="杂乱的想法 → 清晰的文本"
						keys={["右 ⌘", "短按"]}
					/>
					<div className="fold-home-settings-panel fold-home-settings-panel--nested">
						<BooleanField
							label="转写后自动插入输入框"
							checked={config.structureAutoInsert !== false}
							onChange={(v) => void onPersistBoolean("structureAutoInsert", v)}
							hint="关闭后先在 知更 草稿窗里查看、修改，再手动插入或复制"
						/>
					</div>
					<ShortcutRow
						title="代回"
						description="聊天上下文 → 拟好的回复"
						keys={["右 ⌘", "按住"]}
					/>
					<ShortcutRow
						title="Agent"
						description="说出任务 → 自动执行"
						keys={["⌥", "Space"]}
					/>
					<ShortcutRow
						title="取消"
						description="取消当前语音或任务。"
						keys={["Esc"]}
					/>
				</div>
			</SettingsGroup>

			<SettingsGroup icon={<Mic size={18} strokeWidth={1.75} />} title="语音输入">
				<div className="rounded-xl border border-black/8 bg-black/2.5 px-3.5 py-3">
					<div className="flex items-start gap-2.5">
						<StatusDot status={voiceStatus} />
						<div className="min-w-0 flex-1">
							<p className="text-[13px] font-semibold text-[#1d1d1f]">
								{voiceSetup?.title ?? "检查语音状态…"}
							</p>
							<p className="mt-1 text-[11px] leading-relaxed text-[#6e6e73]">
								{voiceSetup?.detail ??
									(planTier === "free"
										? "免费版在本地识别语音，无需配置。"
										: "会员版自动使用云端识别。")}
							</p>
						</div>
						<ConnectionBadge status={voiceStatus} />
					</div>

					{voiceSetup?.mode === "download-needed" && (
						<div className="mt-3 space-y-2">
							<button
								type="button"
								onClick={() => void handleDownloadVoicePack()}
								disabled={downloading}
								className="fold-home-save disabled:opacity-60"
							>
								{downloading
									? "下载中…"
									: `下载语音包（约 ${voiceSetup.downloadSizeMb ?? 470} MB）`}
							</button>
							{downloadError && (
								<p className="text-[11px] leading-relaxed text-red-600">{downloadError}</p>
							)}
						</div>
					)}
				</div>
			</SettingsGroup>

			<div className="rounded-xl border border-black/8">
				<button
					type="button"
					onClick={() => setAdvancedOpen((open) => !open)}
					className="flex w-full items-center justify-between px-3.5 py-3 text-left"
				>
					<span className="text-[13px] font-medium text-[#1d1d1f]">高级设置</span>
					<span className="text-[11px] text-[#86868b]">{advancedOpen ? "收起" : "展开"}</span>
				</button>

				{advancedOpen && (
					<div className="space-y-4 border-t border-black/6 px-3.5 py-4">
						<p className="text-[11px] leading-relaxed text-[#86868b]">
							仅供开发调试或自带 API Key（BYOK）。普通用户无需修改。
						</p>

						<BooleanField
							label="使用自己的 API Key（BYOK）"
							checked={config.byokOverrides ?? false}
							onChange={(v) => onUpdateBoolean("byokOverrides", v)}
							hint="开启后智能能力走你的 Key，不消耗体验次数"
						/>
						<Field
							label="DashScope API Key"
							type="password"
							value={config.dashscopeApiKey ?? ""}
							onChange={(v) => onUpdate("dashscopeApiKey", v)}
						/>
						<Field
							label="OpenRouter API Key"
							type="password"
							value={config.openrouterApiKey ?? ""}
							onChange={(v) => onUpdate("openrouterApiKey", v)}
						/>
						<Field
							label="语音识别路由（开发）"
							value={config.asrProvider ?? "auto"}
							onChange={(v) => onUpdate("asrProvider", v)}
							options={["auto", "local-whisper", "dashscope"]}
						/>
						<Field
							label="本地语音包路径（开发）"
							value={config.localWhisperModelPath ?? ""}
							onChange={(v) => onUpdate("localWhisperModelPath", v)}
							hint="留空则使用默认路径 ~/.fold/models/ggml-small.bin"
						/>
						<Field
							label="Planner Provider"
							value={config.plannerProvider ?? "openrouter"}
							onChange={(v) => onUpdate("plannerProvider", v)}
							options={["openrouter", "openai", "anthropic", "dashscope", "deepseek", "moonshot"]}
						/>
						<Field
							label="Planner Model"
							value={config.plannerModel ?? "openai/gpt-5.5"}
							onChange={(v) => onUpdate("plannerModel", v)}
							hint="Agent 任务规划；转写/代回见下方 Fast Model"
						/>
						<Field
							label="Fast Provider"
							value={config.fastProvider ?? ""}
							onChange={(v) => onUpdate("fastProvider", v)}
							options={["", "openrouter", "openai", "anthropic", "dashscope", "deepseek", "moonshot"]}
							hint="留空继承 Planner Provider"
						/>
						<Field
							label="Fast Model"
							value={config.fastModel ?? ""}
							onChange={(v) => onUpdate("fastModel", v)}
							hint="转写净化、代回草案。留空默认：OpenRouter→gemini-3.1-flash-lite，DashScope→qwen-flash"
						/>
						<Field
							label="Zhipu API Key（OCR）"
							type="password"
							value={config.zhipuApiKey ?? ""}
							onChange={(v) => onUpdate("zhipuApiKey", v)}
						/>
						<Field
							label="Mail Provider"
							value={config.mailProvider ?? "auto"}
							onChange={(v) => onUpdate("mailProvider", v)}
							options={["auto", "apple-mail", "gmail-cli", "gmail-nango", "gmail-web", "file"]}
						/>
						<Field
							label="Playwright Bridge Token"
							type="password"
							value={config.playwrightMcpExtensionToken ?? ""}
							onChange={(v) => onUpdate("playwrightMcpExtensionToken", v)}
						/>
						<Field
							label="Fold Hub API Key"
							type="password"
							value={config.hubApiKey ?? ""}
							onChange={(v) => onUpdate("hubApiKey", v)}
						/>
						<Field
							label="Chrome CDP URL"
							value={config.chromeCdpUrl ?? ""}
							onChange={(v) => onUpdate("chromeCdpUrl", v)}
						/>
						<BooleanField
							label="允许本地脚本执行"
							checked={config.allowScriptExecution ?? false}
							onChange={(v) => onUpdateBoolean("allowScriptExecution", v)}
						/>
						<BooleanField
							label="允许 Agent Subagent"
							checked={config.allowAgentSubagents ?? false}
							onChange={(v) => onUpdateBoolean("allowAgentSubagents", v)}
							hint="通常由「连接」页执行模式管理；此处供开发覆盖"
						/>
						<BooleanField
							label="允许 UI-TARS（实验）"
							checked={config.allowUitars ?? false}
							onChange={(v) => onUpdateBoolean("allowUitars", v)}
						/>
						<BooleanField
							label="允许 Work Buddy"
							checked={config.allowWorkbuddy ?? true}
							onChange={(v) => onUpdateBoolean("allowWorkbuddy", v)}
							hint="通常由「连接」页执行模式管理"
						/>

						<InputHabitScannerPanel />

						<div className="flex items-center gap-3 pt-1">
							<button type="button" onClick={onSave} className="fold-home-save">
								保存高级设置
							</button>
							{saved && (
								<span className="text-[13px] font-medium text-emerald-600">已保存</span>
							)}
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
