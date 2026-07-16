import { useCallback, useEffect, useRef, useState } from "react";
import { ConnectionIcon } from "./ConnectionIcon.js";
import { ZhigengLogoMark } from "./FoldLogo.js";

export interface ConnectFlowTarget {
	connectionId: string;
	label: string;
	kind: "login" | "install";
}

type Phase = "starting" | "ready" | "waiting" | "success" | "error";

export function ConnectFlowModal({
	target,
	onClose,
	onSuccess,
}: {
	target: ConnectFlowTarget | null;
	onClose: () => void;
	onSuccess: () => void;
}) {
	const [phase, setPhase] = useState<Phase>("starting");
	const [title, setTitle] = useState("");
	const [message, setMessage] = useState("");
	const [authUrl, setAuthUrl] = useState<string | null>(null);
	const [userCode, setUserCode] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copyText, setCopyText] = useState<string | null>(null);
	const [copyThenOpen, setCopyThenOpen] = useState(false);
	const [requiresAction, setRequiresAction] = useState(false);
	const [actionLabel, setActionLabel] = useState("继续连接");
	const [copyBusy, setCopyBusy] = useState(false);
	const sessionIdRef = useRef<string | null>(null);
	const openedBrowserRef = useRef(false);
	const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const stopPolling = useCallback(() => {
		if (pollTimerRef.current) {
			clearInterval(pollTimerRef.current);
			pollTimerRef.current = null;
		}
	}, []);

	const startPolling = useCallback(() => {
		stopPolling();
		pollTimerRef.current = setInterval(() => {
			const sid = sessionIdRef.current;
			if (!sid) return;
			void window.fold.pollConnectFlow(sid).then((result) => {
				if (result.status === "success") {
					stopPolling();
					setPhase("success");
					setMessage(result.message ?? "已连接");
					void onSuccess();
					window.setTimeout(() => {
						onClose();
					}, 500);
				} else if (result.status === "error") {
					stopPolling();
					setPhase("error");
					setError(result.error ?? "连接失败");
				} else if (result.message) {
					setMessage(result.message);
				}
			});
		}, 2000);
	}, [onClose, onSuccess, stopPolling]);

	useEffect(() => {
		if (!target) return;

		let cancelled = false;
		sessionIdRef.current = null;
		openedBrowserRef.current = false;
		setPhase("starting");
		setError(null);
		setAuthUrl(null);
		setUserCode(null);
		setCopyText(null);
		setCopyThenOpen(false);
		setRequiresAction(false);
		setActionLabel("继续连接");
		setCopyBusy(false);
		stopPolling();

		void (async () => {
			try {
				const start = await window.fold.startConnectFlow(target.connectionId, target.kind);
				if (cancelled) return;
				sessionIdRef.current = start.sessionId;
				setTitle(start.title);
				setMessage(start.message);
				setAuthUrl(start.authUrl ?? null);
				setUserCode(start.userCode ?? null);
				setCopyText(start.copyText ?? null);
				const needsCopyFirst = start.copyThenOpen ?? false;
				const needsAction = start.requiresAction ?? false;
				setCopyThenOpen(needsCopyFirst);
				setRequiresAction(needsAction);
				setActionLabel(start.actionLabel ?? "继续连接");
				setPhase(needsCopyFirst || needsAction ? "ready" : "waiting");

				if (start.opensBrowserAutomatically && start.authUrl && !openedBrowserRef.current) {
					openedBrowserRef.current = true;
					await window.fold.openExternal(start.authUrl);
				}

				if (!needsCopyFirst && !needsAction) startPolling();
			} catch (err) {
				if (cancelled) return;
				setPhase("error");
				setError((err as Error).message);
			}
		})();

		return () => {
			cancelled = true;
			stopPolling();
		};
	}, [target, startPolling, stopPolling]);

	const handleClose = () => {
		stopPolling();
		const sid = sessionIdRef.current;
		if (sid) void window.fold.cancelConnectFlow(sid);
		onClose();
	};

	const handleOpenAuth = async () => {
		if (!authUrl) return;
		await window.fold.openExternal(authUrl);
	};

	const handleActivateConnect = async () => {
		const sid = sessionIdRef.current;
		if (!sid || copyBusy) return;
		setCopyBusy(true);
		try {
			if (copyText) await navigator.clipboard.writeText(copyText);
			const result = await window.fold.activateConnectFlow(sid);
			if (!result.opened && result.url) {
				await window.fold.openExternal(result.url);
			}
			setMessage(
				target?.connectionId === "workbuddy"
					? "Work Buddy 已打开。保持一个对话打开，知更会自动完成连接。"
					: target?.connectionId === "agent-codex"
						? "Codex 已打开。完成登录后，知更会自动连接。"
						: "已开始连接。完成登录后，知更会自动检测。",
			);
			setPhase("waiting");
			startPolling();
		} catch (err) {
			setPhase("error");
			setError((err as Error).message);
		} finally {
			setCopyBusy(false);
		}
	};

	if (!target) return null;

	const showWorkBuddySteps =
		target.connectionId === "workbuddy" && (phase === "ready" || phase === "waiting");

	return (
		<div className="fold-connect-overlay" onClick={handleClose}>
			<div className="fold-connect-modal" onClick={(e) => e.stopPropagation()}>
				<div className="fold-connect-logos">
					<div className="fold-connect-logo-tile fold-connect-logo-fold">
						<ZhigengLogoMark size={22} className="text-[#1d1d1f]" />
					</div>
					<div className="fold-connect-logo-link" aria-hidden="true">
						<span />
						<span />
						<span />
					</div>
					<div className="fold-connect-logo-tile">
						<ConnectionIcon id={target.connectionId} size={24} />
					</div>
				</div>

				<h3 className="fold-connect-title">{title || `连接 ${target.label}`}</h3>
				<p className="fold-connect-message">
					{phase === "error" ? error : phase === "success" ? message : message || "正在准备授权…"}
				</p>

				{userCode && phase === "waiting" && (
					<div className="fold-connect-code">
						<p className="fold-connect-code-label">授权码</p>
						<p className="fold-connect-code-value">{userCode}</p>
					</div>
				)}

				{showWorkBuddySteps && (
					<div className="fold-connect-steps">
						<ol>
							<li>知更打开 Work Buddy</li>
							<li>如有需要，在客户端完成登录</li>
							<li>保持任意对话打开，连接会自动完成</li>
						</ol>
						{copyText && (
							<p className="fold-connect-command" title={copyText}>
								{copyText}
							</p>
						)}
					</div>
				)}

				{phase === "waiting" && !authUrl && !copyThenOpen && (
					<p className="fold-connect-hint">完成上述步骤后，知更 会自动检测连接状态…</p>
				)}

				{phase === "waiting" && copyThenOpen && (
					<p className="fold-connect-hint">正在等待 WorkBuddy 完成配对…</p>
				)}

				<div className="fold-connect-actions">
					{phase === "ready" && (copyThenOpen || requiresAction) && (
						<button
							type="button"
							className="fold-connect-btn fold-connect-btn-primary"
							disabled={copyBusy}
							onClick={() => void handleActivateConnect()}
						>
							{copyBusy ? "正在打开…" : actionLabel}
						</button>
					)}
					{phase === "waiting" && authUrl && (
						<button type="button" className="fold-connect-btn fold-connect-btn-primary" onClick={() => void handleOpenAuth()}>
							打开授权页
						</button>
					)}
					{phase === "starting" && (
						<button type="button" className="fold-connect-btn" disabled>
							准备中…
						</button>
					)}
					{phase === "success" && (
						<button type="button" className="fold-connect-btn fold-connect-btn-primary" disabled>
							已连接
						</button>
					)}
					{phase === "error" && (
						<button type="button" className="fold-connect-btn fold-connect-btn-primary" onClick={handleClose}>
							关闭
						</button>
					)}
					{phase !== "success" && phase !== "error" && (
						<button type="button" className="fold-connect-btn fold-connect-btn-muted" onClick={handleClose}>
							取消
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
