import { useState } from "react";
import type { HomeConnection, HomeSnapshot } from "../types.js";
import { ConnectionIcon } from "../components/ConnectionIcon.js";
import { ConnectionBadge, StatusDot } from "../components/FormFields.js";

type RowAction = {
	id: string;
	label: string;
	primary?: boolean;
};

function isAgentConnection(id: string): boolean {
	return id === "claude-code" || id === "codex" || id === "cursor" || id === "agent";
}

function actionsFor(conn: HomeConnection, summary: HomeSnapshot["configSummary"]): RowAction[] {
	if (isAgentConnection(conn.id)) {
		if (!summary.allowAgentSubagents) {
			return [{ id: "agent:enable", label: "开启", primary: true }];
		}
		if (conn.status !== "ok") {
			const actions: RowAction[] = [{ id: "refresh", label: "重新检测" }];
			if (conn.id === "codex") {
				actions.unshift({ id: "codex:install-terminal", label: "终端重装", primary: true });
			}
			if (conn.id === "claude-code") {
				actions.unshift({ id: "claude:login-terminal", label: "终端登录", primary: true });
			}
			if (actions.length === 1) {
				actions.unshift({ id: "agent:settings", label: "去设置", primary: true });
			}
			return actions;
		}
		return [{ id: "refresh", label: "重新检测" }];
	}

	switch (conn.id) {
		case "gmail":
			if (conn.status !== "ok") {
				return [
					{ id: "gmail:terminal-auth", label: "终端授权", primary: true },
					{ id: "gmail:open-browser", label: "打开 Gmail" },
				];
			}
			return [
				{ id: "gmail:open-browser", label: "打开 Gmail" },
				{ id: "refresh", label: "重新检测" },
			];
		case "cdp":
			if (conn.status !== "ok") {
				return [
					{ id: "cdp:settings", label: "去配置", primary: true },
					{ id: "cdp:open-chrome-help", label: "配置说明" },
				];
			}
			return [{ id: "refresh", label: "重新检测" }];
		case "screen":
			if (conn.status !== "ok") {
				return [{ id: "screen:open-settings", label: "打开系统设置", primary: true }];
			}
			return [{ id: "refresh", label: "重新检测" }];
		case "uitars":
			if (!summary.allowUitars) {
				return [{ id: "uitars:enable", label: "开启", primary: true }];
			}
			if (conn.status !== "ok") {
				return [
					{ id: "uitars:settings", label: "去设置", primary: true },
					{ id: "refresh", label: "重新检测" },
				];
			}
			return [{ id: "refresh", label: "重新检测" }];
		case "workbuddy":
			if (!summary.allowWorkbuddy) {
				return [{ id: "workbuddy:enable", label: "开启", primary: true }];
			}
			if (conn.status !== "ok") {
				return [
					{ id: "workbuddy:settings", label: "去设置", primary: true },
					{ id: "refresh", label: "重新检测" },
				];
			}
			return [{ id: "refresh", label: "重新检测" }];
		default:
			return [{ id: "refresh", label: "重新检测" }];
	}
}

export function ConnectionsSection({
	snapshot,
	onRefresh,
	onOpenSettings,
}: {
	snapshot: HomeSnapshot;
	onRefresh: () => Promise<void>;
	onOpenSettings: () => void;
}) {
	const [busyId, setBusyId] = useState<string | null>(null);

	const runAction = async (conn: HomeConnection, action: RowAction) => {
		const key = `${conn.id}:${action.id}`;
		setBusyId(key);
		try {
			if (action.id === "refresh") {
				await onRefresh();
				return;
			}
			if (action.id === "agent:enable") {
				const config = await window.fold.getConfig();
				await window.fold.saveConfig({ ...config, allowAgentSubagents: true });
				await onRefresh();
				return;
			}
			if (action.id === "agent:settings" || action.id.endsWith(":settings")) {
				onOpenSettings();
				return;
			}
			if (action.id === "uitars:enable") {
				const config = await window.fold.getConfig();
				await window.fold.saveConfig({ ...config, allowUitars: true });
				await onRefresh();
				return;
			}
			if (action.id === "workbuddy:enable") {
				const config = await window.fold.getConfig();
				await window.fold.saveConfig({ ...config, allowWorkbuddy: true });
				await onRefresh();
				return;
			}
			if (action.id === "cdp:settings") {
				onOpenSettings();
				return;
			}
			const context =
				action.id === "gmail:terminal-auth"
					? { backend: conn.meta?.backend === "gws" ? "gws" : "gog" }
					: undefined;
			await window.fold.runConnectionAction(action.id, context);
			if (
				action.id !== "gmail:open-browser" &&
				action.id !== "cdp:open-chrome-help" &&
				action.id !== "codex:install-terminal" &&
				action.id !== "claude:login-terminal"
			) {
				await onRefresh();
			}
		} finally {
			setBusyId(null);
		}
	};

	return (
		<div className="space-y-3">
			<div className="mb-1 flex items-center justify-end">
				<button
					type="button"
					className="fold-home-inline-btn"
					disabled={busyId !== null}
					onClick={() => {
						setBusyId("all:refresh");
						void onRefresh().finally(() => setBusyId(null));
					}}
				>
					{busyId === "all:refresh" ? "刷新中…" : "全部刷新"}
				</button>
			</div>

			{snapshot.connections.map((conn) => {
				const actions = actionsFor(conn, snapshot.configSummary);
				return (
					<div key={conn.id} className="fold-home-connection-row">
						<div className="flex min-w-0 items-center gap-3">
							<div className="fold-home-icon-tile">
								<ConnectionIcon id={conn.id} size={20} />
							</div>
							<div className="min-w-0">
								<div className="flex items-center gap-2">
									<StatusDot status={conn.status} />
									<span className="text-[13px] font-semibold tracking-[-0.01em] text-[#1d1d1f]">
										{conn.label}
									</span>
								</div>
								{conn.detail && (
									<p className="mt-1 truncate text-[11px] text-[#86868b]">{conn.detail}</p>
								)}
							</div>
						</div>

						<div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center">
							<ConnectionBadge status={conn.status} />
							<div className="flex flex-wrap justify-end gap-1.5">
								{actions.map((action) => {
									const key = `${conn.id}:${action.id}`;
									const busy = busyId === key || (action.id === "refresh" && busyId?.endsWith(":refresh"));
									return (
										<button
											key={action.id}
											type="button"
											disabled={busyId !== null && !busy}
											className={
												action.primary ? "fold-home-row-btn" : "fold-home-row-btn fold-home-row-btn-muted"
											}
											onClick={() => void runAction(conn, action)}
										>
											{busy ? "…" : action.label}
										</button>
									);
								})}
							</div>
						</div>
					</div>
				);
			})}

			<p className="fold-home-footnote">
				可直接在此开启能力、授权或跳转设置。完成终端授权或系统权限后，点「重新检测」更新状态。
			</p>
		</div>
	);
}
