import { useEffect, useState } from "react";

export interface ProfileImportOption {
	id: string;
	label: string;
	hasOpenTab: boolean;
	tabUrl?: string;
	tabTitle?: string;
	defaultUrl: string;
	automationSupported: boolean;
}

export const FALLBACK_PLATFORMS: ProfileImportOption[] = [
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

export function useProfileImport() {
	const [options, setOptions] = useState<ProfileImportOption[]>([]);
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [responseText, setResponseText] = useState("");
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [info, setInfo] = useState<string | null>(null);

	useEffect(() => {
		let mounted = true;
		setLoading(true);
		void window.fold.profileImportOptions()
			.then((opts) => {
				if (!mounted) return;
				const platforms = opts.length > 0 ? opts : FALLBACK_PLATFORMS;
				setOptions(platforms);
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

	const selected = options.find((o) => o.id === selectedId) ?? null;

	useEffect(() => {
		setError(null);
	}, [selectedId]);

	async function copyPromptAndOpen() {
		if (!selected) return;
		setError(null);
		await window.fold.profileCopyPrompt();
		await window.fold.openExternal(selected.defaultUrl);
		setInfo(`Prompt 已复制，正在打开 ${selected.label}。发送后把完整回复粘贴到下方。`);
	}

	async function saveResponse() {
		if (!responseText.trim()) {
			setError("请粘贴或等待 AI 回复");
			return null;
		}
		setSaving(true);
		setError(null);
		try {
			const result = await window.fold.profileSaveResponse(responseText);
			if (!result.ok) {
				setError(result.error ?? "保存失败");
				return null;
			}
			return result.profile ?? null;
		} catch (err) {
			setError((err as Error).message);
			return null;
		} finally {
			setSaving(false);
		}
	}

	return {
		options,
		selectedId,
		setSelectedId,
		selected,
		responseText,
		setResponseText,
		loading,
		saving,
		error,
		info,
		setError,
		copyPromptAndOpen,
		saveResponse,
	};
}
