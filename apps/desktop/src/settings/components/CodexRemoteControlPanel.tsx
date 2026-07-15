import { useCallback, useEffect, useRef, useState } from "react";
import { IosSwitch, StatusDot } from "./FormFields.js";

type RemoteStatus = "disabled" | "connecting" | "connected" | "errored" | "unknown";

type RemoteClient = {
	clientId: string;
	name?: string;
	lastConnectedAt?: number;
	platform?: string;
};

function statusLabel(status: RemoteStatus): string {
	switch (status) {
		case "connected":
			return "已连接中继";
		case "connecting":
			return "正在连接…";
		case "disabled":
			return "已关闭";
		case "errored":
			return "出错";
		default:
			return "不可用";
	}
}

function formatWhen(ts?: number): string {
	if (!ts) return "—";
	const ms = ts > 1e12 ? ts : ts * 1000;
	return new Date(ms).toLocaleString("zh-CN", {
		month: "numeric",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/**
 * Codex Remote Control：手机控制这台 Mac。
 * 不自动开启 —— 用户必须显式确认。
 */
export function CodexRemoteControlPanel() {
	const [status, setStatus] = useState<RemoteStatus>("unknown");
	const [serverName, setServerName] = useState<string | null>(null);
	const [environmentId, setEnvironmentId] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [clients, setClients] = useState<RemoteClient[]>([]);
	const [busy, setBusy] = useState(false);
	const [pairingCode, setPairingCode] = useState<string | null>(null);
	const [pairingExpiresAt, setPairingExpiresAt] = useState<number | null>(null);
	const [pairHint, setPairHint] = useState<string | null>(null);
	const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

	const stopPairPoll = useCallback(() => {
		if (pollRef.current) {
			clearInterval(pollRef.current);
			pollRef.current = null;
		}
	}, []);

	const refresh = useCallback(async () => {
		const snap = await window.fold.codexRemoteStatus();
		setStatus(snap.status);
		setServerName(snap.serverName ?? null);
		setEnvironmentId(snap.environmentId ?? null);
		setError(snap.error ?? null);
		const listed = await window.fold.codexRemoteClients();
		if (listed.error) setError(listed.error);
		setClients(listed.clients);
		if (listed.environmentId) setEnvironmentId(listed.environmentId);
	}, []);

	useEffect(() => {
		void refresh();
		return () => stopPairPoll();
	}, [refresh, stopPairPoll]);

	const enabled = status === "connected" || status === "connecting";

	const toggle = async (next: boolean) => {
		setBusy(true);
		setError(null);
		try {
			if (next) {
				const confirmed = window.confirm(
					"开启后，已配对的手机可通过 Codex 安全中继控制这台 Mac 上的 Codex 任务。\n\n任务仍在本机执行；接电时 Codex 会尽量保持 Mac 唤醒。确定开启？",
				);
				if (!confirmed) return;
				const snap = await window.fold.codexRemoteEnable();
				setStatus(snap.status);
				setEnvironmentId(snap.environmentId ?? null);
				setError(snap.error ?? null);
			} else {
				const snap = await window.fold.codexRemoteDisable();
				setStatus(snap.status);
				setError(snap.error ?? null);
				stopPairPoll();
				setPairingCode(null);
			}
			await refresh();
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const startPairing = async () => {
		setBusy(true);
		setPairHint(null);
		setError(null);
		try {
			if (!enabled) {
				const confirmed = window.confirm(
					"配对前需要先开启远程控制。确定开启并开始配对？",
				);
				if (!confirmed) return;
				await window.fold.codexRemoteEnable();
			}
			const pair = await window.fold.codexRemotePairStart();
			const code = pair.manualPairingCode || pair.pairingCode || null;
			setPairingCode(code);
			setPairingExpiresAt(pair.expiresAt ?? null);
			if (pair.environmentId) setEnvironmentId(pair.environmentId);
			if (!code) {
				setError("未拿到配对码。请升级 Codex CLI 到支持 remote-control 的版本。");
				return;
			}
			setPairHint("在 iPhone 的 Codex App 中输入配对码完成授权。");
			stopPairPoll();
			pollRef.current = setInterval(() => {
				void (async () => {
					const result = await window.fold.codexRemotePairPoll({
						manualPairingCode: pair.manualPairingCode,
						pairingCode: pair.pairingCode,
					});
					if (result.claimed) {
						stopPairPoll();
						setPairHint("设备已配对。");
						setPairingCode(null);
						await refresh();
					}
				})();
			}, 2000);
		} catch (err) {
			setError(err instanceof Error ? err.message : String(err));
		} finally {
			setBusy(false);
		}
	};

	const revoke = async (clientId: string) => {
		if (!window.confirm("撤销后该设备将无法再远程控制本机 Codex。确定？")) return;
		setBusy(true);
		try {
			const result = await window.fold.codexRemoteRevoke(clientId);
			if (!result.ok) setError(result.error ?? "撤销失败");
			await refresh();
		} finally {
			setBusy(false);
		}
	};

	return (
		<section className="fold-codex-remote">
			<div className="fold-codex-remote-head">
				<div>
					<h2>远程控制这台 Mac</h2>
					<p>
						通过 Codex Remote Control，用 iPhone 查看知更交给 Codex 的任务进度、审批与追加指令。
						任务仍在本机运行；接电且开启远程访问时，Codex 会尽量保持 Mac 唤醒。
					</p>
				</div>
				<div className="fold-codex-remote-toggle">
					<StatusDot
						status={
							status === "connected" ? "ok" : status === "connecting" ? "warn" : "off"
						}
					/>
					<span>{statusLabel(status)}</span>
					<IosSwitch
						checked={enabled}
						disabled={busy}
						ariaLabel="开启 Codex 远程控制"
						onChange={(v) => void toggle(v)}
					/>
				</div>
			</div>

			{serverName && (
				<p className="fold-codex-remote-meta">本机名称 · {serverName}</p>
			)}
			{error && <p className="fold-codex-remote-error">{error}</p>}

			<div className="fold-codex-remote-actions">
				<button type="button" className="fold-profile-action-btn" disabled={busy} onClick={() => void startPairing()}>
					允许连接 · 开始配对
				</button>
				<button type="button" className="fold-home-inline-btn" disabled={busy} onClick={() => void refresh()}>
					刷新状态
				</button>
			</div>

			{pairingCode && (
				<div className="fold-codex-remote-pair">
					<span className="fold-codex-remote-code">{pairingCode}</span>
					{pairingExpiresAt ? (
						<small>有效至 {formatWhen(pairingExpiresAt)}</small>
					) : null}
					{pairHint && <p>{pairHint}</p>}
				</div>
			)}

			<div className="fold-codex-remote-clients">
				<h3>已授权设备</h3>
				{clients.length === 0 ? (
					<p className="fold-memory-empty">还没有配对设备。开启远程控制后，用手机 Codex 扫码或输入配对码。</p>
				) : (
					<ul>
						{clients.map((client) => (
							<li key={client.clientId}>
								<div>
									<strong>{client.name ?? client.clientId}</strong>
									<small>
										{client.platform ?? "设备"} · 最近 {formatWhen(client.lastConnectedAt)}
									</small>
								</div>
								<button
									type="button"
									className="fold-home-inline-btn"
									disabled={busy}
									onClick={() => void revoke(client.clientId)}
								>
									撤销
								</button>
							</li>
						))}
					</ul>
				)}
				{environmentId && (
					<p className="fold-codex-remote-meta">环境 · {environmentId.slice(0, 12)}…</p>
				)}
			</div>
		</section>
	);
}
