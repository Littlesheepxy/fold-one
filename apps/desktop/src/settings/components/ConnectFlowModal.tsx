import { useEffect, useRef, useState } from "react";
import { ConnectionIcon } from "./ConnectionIcon.js";
import { FoldLogoMark } from "./FoldLogo.js";

export interface ConnectFlowTarget {
	connectionId: string;
	label: string;
	kind: "login" | "install";
}

type Phase = "starting" | "waiting" | "success" | "error";

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
	const sessionIdRef = useRef<string | null>(null);
	const openedBrowserRef = useRef(false);

	useEffect(() => {
		if (!target) return;

		let cancelled = false;
		let pollTimer: ReturnType<typeof setInterval> | null = null;
		sessionIdRef.current = null;
		openedBrowserRef.current = false;
		setPhase("starting");
		setError(null);
		setAuthUrl(null);
		setUserCode(null);

		const cleanup = () => {
			cancelled = true;
			if (pollTimer) clearInterval(pollTimer);
		};

		void (async () => {
			try {
				const start = await window.fold.startConnectFlow(target.connectionId, target.kind);
				if (cancelled) return;
				sessionIdRef.current = start.sessionId;
				setTitle(start.title);
				setMessage(start.message);
				setAuthUrl(start.authUrl ?? null);
				setUserCode(start.userCode ?? null);
				setPhase("waiting");

				if (start.opensBrowserAutomatically && start.authUrl && !openedBrowserRef.current) {
					openedBrowserRef.current = true;
					await window.fold.openExternal(start.authUrl);
				}

				pollTimer = setInterval(() => {
					const sid = sessionIdRef.current;
					if (!sid || cancelled) return;
					void window.fold.pollConnectFlow(sid).then((result) => {
						if (cancelled) return;
						if (result.status === "success") {
							if (pollTimer) clearInterval(pollTimer);
							setPhase("success");
							setMessage(result.message ?? "已连接");
							window.setTimeout(() => {
								onSuccess();
								onClose();
							}, 1200);
						} else if (result.status === "error") {
							if (pollTimer) clearInterval(pollTimer);
							setPhase("error");
							setError(result.error ?? "连接失败");
						}
					});
				}, 2000);
			} catch (err) {
				if (cancelled) return;
				setPhase("error");
				setError((err as Error).message);
			}
		})();

		return cleanup;
	}, [target, onClose, onSuccess]);

	const handleClose = () => {
		const sid = sessionIdRef.current;
		if (sid) void window.fold.cancelConnectFlow(sid);
		onClose();
	};

	const handleOpenAuth = async () => {
		if (!authUrl) return;
		await window.fold.openExternal(authUrl);
	};

	if (!target) return null;

	return (
		<div className="fold-connect-overlay" onClick={handleClose}>
			<div className="fold-connect-modal" onClick={(e) => e.stopPropagation()}>
				<div className="fold-connect-logos">
					<div className="fold-connect-logo-tile fold-connect-logo-fold">
						<FoldLogoMark size={22} className="text-[#1d1d1f]" />
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

				<div className="fold-connect-actions">
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
