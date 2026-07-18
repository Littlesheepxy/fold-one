import { useEffect, useMemo, useRef, useState } from "react";
import {
	ChevronUp,
	Keyboard,
	Mic,
	Send,
	ShieldAlert,
	Terminal,
	X,
} from "lucide-react";
import type { UserActionOption, UserActionResponse, UserInteractionView } from "@fold/runtime";
import { ZhigengLogoMark } from "../../components/ZhigengLogoMark";
import { VoiceWave } from "./VoiceWave";

interface Props {
	interaction?: UserInteractionView | null;
	title?: string | null;
	message?: string | null;
	hint?: string | null;
	options: UserActionOption[];
	voiceLevel: number;
	onRespond: (response: UserActionResponse) => void;
	onToggleVoice: () => void;
	onCollapse: () => void;
}

const RISK_LABEL: Record<UserInteractionView["risk"], string> = {
	low: "需要你的选择",
	sensitive: "涉及权限或账号操作",
	external: "将向外部发送消息",
	destructive: "此操作可能无法撤销",
};

function optionClass(option: UserActionOption): string {
	return `fold-hitl-option fold-hitl-option-${option.tone ?? "secondary"}`;
}

export function AskOptions({
	interaction,
	title,
	message,
	hint,
	options,
	voiceLevel,
	onRespond,
	onToggleVoice,
	onCollapse,
}: Props) {
	const [inputMode, setInputMode] = useState<"voice" | "text">("voice");
	const [text, setText] = useState("");
	const [busy, setBusy] = useState(false);
	const inputRef = useRef<HTMLInputElement>(null);
	const requestId = interaction?.id;
	const inputPolicy = interaction?.input ?? {
		primary: "choice" as const,
		allowVoice: true,
		allowText: true,
		acceptFreeform: false,
	};
	const listening = Boolean(interaction?.listening);
	const risk = interaction?.risk ?? "low";
	const showRisk = Boolean(hint) || risk !== "low";
	const messageLines = useMemo(
		() => (message ?? "").split("\n").map((line) => line.trim()).filter(Boolean),
		[message],
	);
	const hasTerminalChoice = useMemo(
		() => options.some((option) => /terminal|oauth|login|auth/i.test(option.id)),
		[options],
	);

	useEffect(() => {
		setText(interaction?.draft ?? "");
		setInputMode(
			interaction?.draft || !inputPolicy.allowVoice || inputPolicy.primary === "secure"
				? "text"
				: "voice",
		);
		setBusy(false);
	}, [requestId, interaction?.draft, inputPolicy.allowVoice, inputPolicy.primary]);

	useEffect(() => {
		if (inputMode === "text") inputRef.current?.focus();
	}, [inputMode]);

	const respond = (response: UserActionResponse) => {
		if (busy) return;
		setBusy(true);
		onRespond(response);
	};

	const respondOption = (option: UserActionOption) => {
		respond({
			requestId,
			optionId: option.id,
			modality: /terminal|oauth|login|auth/i.test(option.id) ? "terminal" : "click",
		});
	};

	const submitText = () => {
		const value = text.trim();
		if (!value) return;
		respond({ requestId, text: value, modality: "text" });
	};

	const hasAuthPoll = useMemo(
		() => options.some((option) => /:poll-done$|poll-done/i.test(option.id)),
		[options],
	);

	return (
		<section className="fold-hitl" aria-labelledby="fold-hitl-title">
			<header className="fold-hitl-header">
				<div className="fold-hitl-brand">
					<ZhigengLogoMark size={30} mono />
					<span>知更</span>
				</div>
				<div className="fold-hitl-status">
					<span className="fold-hitl-status-dot" aria-hidden="true" />
					<span>{hasAuthPoll ? "等待授权 · 完成后自动继续" : "等待确认"}</span>
				</div>
				{interaction?.collapsible !== false ? (
					<button
						type="button"
						className="fold-hitl-collapse"
						onClick={onCollapse}
						aria-label="折叠确认卡"
						title="折叠，任务会继续保留"
					>
						<ChevronUp size={16} strokeWidth={2.2} />
					</button>
				) : null}
			</header>

			<div className="fold-hitl-body">
				<div className="fold-hitl-copy">
					<h2 id="fold-hitl-title" className="fold-hitl-title">
						{title ?? "需要你的确认"}
					</h2>
					{messageLines.length > 0 ? (
						<div className="fold-hitl-message">
							{messageLines.map((line, index) => (
								<p key={`${index}-${line}`} className={index === 0 ? "is-lead" : undefined}>
									{line}
								</p>
							))}
						</div>
					) : null}
				</div>

				{showRisk ? (
					<div className={`fold-hitl-risk fold-hitl-risk-${risk}`}>
						<ShieldAlert size={13} strokeWidth={2} aria-hidden="true" />
						<span>{hint || RISK_LABEL[risk]}</span>
					</div>
				) : null}

				{options.length > 0 ? (
					<div className="fold-hitl-actions">
						<div className="fold-hitl-option-row">
							{options.map((option) => (
								<button
									key={option.id}
									type="button"
									className={optionClass(option)}
									onClick={() => respondOption(option)}
									disabled={busy || listening}
									title={option.description}
								>
									{option.label}
								</button>
							))}
						</div>
					</div>
				) : null}

				<div className="fold-hitl-input">
					{inputMode === "voice" && inputPolicy.allowVoice ? (
						<div className={`fold-hitl-voice-bar ${listening ? "is-listening" : ""}`}>
							<span className="fold-hitl-voice-mode">{listening ? "回答中" : "语音"}</span>
							<span className="fold-input-separator" aria-hidden="true" />
							{listening ? (
								<VoiceWave level={voiceLevel} active />
							) : (
								<span className="fold-hitl-voice-hint">按右⌘开始</span>
							)}
							<button
								type="button"
								className="fold-input-close"
								onClick={onToggleVoice}
								disabled={busy}
								aria-pressed={listening}
								aria-label={listening ? "结束并发送" : "开始语音回答"}
								title={listening ? "再按右⌘结束并发送" : "按右⌘开始语音回答"}
							>
								{listening ? <X size={14} strokeWidth={2.2} /> : <Mic size={14} strokeWidth={2.2} />}
							</button>
						</div>
					) : inputPolicy.allowText ? (
						<div className="fold-hitl-text-row">
							<input
								ref={inputRef}
								type={interaction?.kind === "secret" ? "password" : "text"}
								value={text}
								disabled={busy || listening}
								onChange={(event) => setText(event.target.value)}
								onKeyDown={(event) => {
									if (event.key === "Enter" && !event.nativeEvent.isComposing) submitText();
								}}
								placeholder={
									inputPolicy.acceptFreeform ? "补充要求，或直接回答…" : "输入选项名称"
								}
								aria-label="文本回答"
							/>
							<button
								type="button"
								onClick={submitText}
								disabled={busy || listening}
								aria-label="发送文本回答"
							>
								<Send size={14} />
							</button>
						</div>
					) : null}

					{inputPolicy.allowVoice && inputPolicy.allowText ? (
						<button
							type="button"
							className="fold-hitl-input-switch"
							onClick={() => setInputMode(inputMode === "voice" ? "text" : "voice")}
							disabled={busy || listening}
						>
							{inputMode === "voice" ? <Keyboard size={13} /> : <Mic size={13} />}
							{inputMode === "voice" ? "键盘" : "语音"}
						</button>
					) : null}
				</div>

				{interaction?.validationMessage ? (
					<p className="fold-hitl-validation">{interaction.validationMessage}</p>
				) : null}

				<footer className="fold-hitl-footer">
					<span>已保存，折叠后可继续</span>
					{hasTerminalChoice ? (
						<span className="fold-hitl-terminal-note">
							<Terminal size={12} /> TTY / OAuth 会在终端继续
						</span>
					) : null}
				</footer>
			</div>
		</section>
	);
}
