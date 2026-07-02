import type { ReactNode } from "react";
import type { FoldConfig } from "../types.js";
import { BRAND_ICONS, BrandIcon, ChromeIcon } from "../components/brand-icons.js";
import { BooleanField, Field } from "../components/FormFields.js";

function SettingsGroup({
	icon,
	title,
	children,
}: {
	icon: ReactNode;
	title: string;
	children: ReactNode;
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

export function SettingsSection({
	config,
	saved,
	onUpdate,
	onUpdateBoolean,
	onSave,
}: {
	config: FoldConfig;
	saved: boolean;
	onUpdate: (key: keyof FoldConfig, value: string) => void;
	onUpdateBoolean: (key: keyof FoldConfig, value: boolean) => void;
	onSave: () => void;
}) {
	return (
		<div className="space-y-4">
			<SettingsGroup icon={<BrandIcon src={BRAND_ICONS.openrouter} size={20} />} title="语音 & Planner">
				<Field
					label="DashScope API Key（语音识别）"
					type="password"
					value={config.dashscopeApiKey ?? ""}
					onChange={(v) => onUpdate("dashscopeApiKey", v)}
					hint="留空则使用 Mock ASR 演示"
				/>
				<Field
					label="OpenRouter API Key（Planner）"
					type="password"
					value={config.openrouterApiKey ?? ""}
					onChange={(v) => onUpdate("openrouterApiKey", v)}
					hint="也可在项目根 .env 里配置 OPENROUTER_API_KEY"
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
					hint="OpenRouter 模型 ID，如 openai/gpt-5.5"
				/>
				<Field
					label="ASR WebSocket URL"
					value={config.asrWsUrl ?? "ws://localhost:3003"}
					onChange={(v) => onUpdate("asrWsUrl", v)}
				/>
			</SettingsGroup>

			<SettingsGroup icon={<BrandIcon src={BRAND_ICONS.zhipu} size={20} />} title="OCR & 邮件">
				<Field
					label="Zhipu API Key（OCR fallback）"
					type="password"
					value={config.zhipuApiKey ?? ""}
					onChange={(v) => onUpdate("zhipuApiKey", v)}
					hint="扫描件/图片 PDF 提取失败时使用"
				/>
				<Field
					label="Zhipu OCR Model"
					value={config.zhipuOcrModel ?? "glm-ocr"}
					onChange={(v) => onUpdate("zhipuOcrModel", v)}
				/>
				<Field
					label="Mail Provider"
					value={config.mailProvider ?? "auto"}
					onChange={(v) => onUpdate("mailProvider", v)}
					options={["auto", "apple-mail", "gmail-cli", "gmail-nango", "gmail-web", "file"]}
				/>
				<Field
					label="Nango Secret Key（托管授权）"
					type="password"
					value={config.nangoSecretKey ?? ""}
					onChange={(v) => onUpdate("nangoSecretKey", v)}
					hint="app.nango.dev → Environment Settings 获取；配置后可一键授权 Gmail 等应用"
				/>
				<Field
					label="Chrome CDP URL（Gmail Web）"
					value={config.chromeCdpUrl ?? ""}
					onChange={(v) => onUpdate("chromeCdpUrl", v)}
					hint="例：http://127.0.0.1:9222"
				/>
			</SettingsGroup>

			<SettingsGroup icon={<ChromeIcon size={20} />} title="自动化 & Agent">
				<BooleanField
					label="允许本地脚本执行"
					checked={config.allowScriptExecution ?? false}
					onChange={(v) => onUpdateBoolean("allowScriptExecution", v)}
					hint="开启后 Planner 可以调用 os.shell / os.applescript / os.python"
				/>
				<BooleanField
					label="允许脚本写文件"
					checked={config.allowFileWrite ?? false}
					onChange={(v) => onUpdateBoolean("allowFileWrite", v)}
					hint="预留开关；默认关闭"
				/>
				<BooleanField
					label="允许本地 Agent Subagent"
					checked={config.allowAgentSubagents ?? false}
					onChange={(v) => onUpdateBoolean("allowAgentSubagents", v)}
					hint="开启后 Tier 2 / Repair 可调用本机 claude / codex / agent CLI"
				/>
				<BooleanField
					label="允许 UI-TARS GUI 修复（实验）"
					checked={config.allowUitars ?? false}
					onChange={(v) => onUpdateBoolean("allowUitars", v)}
					hint="原生桌面 App 视觉自动化；需配置下方 UI-TARS VLM"
				/>
				<Field
					label="UI-TARS VLM Base URL"
					value={config.uitarsVlmBaseUrl ?? "https://openrouter.ai/api/v1"}
					onChange={(v) => onUpdate("uitarsVlmBaseUrl", v)}
				/>
				<Field
					label="UI-TARS VLM API Key"
					type="password"
					value={config.uitarsVlmApiKey ?? ""}
					onChange={(v) => onUpdate("uitarsVlmApiKey", v)}
				/>
				<Field
					label="UI-TARS VLM Model"
					value={config.uitarsVlmModel ?? "bytedance/ui-tars-1.5-7b"}
					onChange={(v) => onUpdate("uitarsVlmModel", v)}
				/>
				<BooleanField
					label="允许 Work Buddy 工作流"
					checked={config.allowWorkbuddy ?? true}
					onChange={(v) => onUpdateBoolean("allowWorkbuddy", v)}
				/>
				<Field
					label="Work Buddy Gateway URL"
					value={config.workbuddyGatewayUrl ?? "http://127.0.0.1:5126"}
					onChange={(v) => onUpdate("workbuddyGatewayUrl", v)}
				/>
			</SettingsGroup>

			<div className="flex items-center gap-3 pt-1">
				<button type="button" onClick={onSave} className="fold-home-save">
					保存
				</button>
				{saved && <span className="text-[13px] font-medium text-emerald-600">已保存</span>}
			</div>

			<p className="fold-home-footnote">快捷键：⌥ Space 开始/结束语音；Esc 取消。</p>
		</div>
	);
}
