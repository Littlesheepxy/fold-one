import { useState } from "react";
import type { HomeConnection, HomeSnapshot } from "../types.js";
import { ConnectionIcon } from "../components/ConnectionIcon.js";
import { ConnectionBadge, StatusDot } from "../components/FormFields.js";

type RowAction = {
	id: string;
	label: string;
	primary?: boolean;
};

type ConnectionGroup = {
	id: string;
	title: string;
	description: string;
	match: (conn: HomeConnection) => boolean;
};

const CONNECTION_GROUPS: ConnectionGroup[] = [
	{
		id: "apps",
		title: "操作应用",
		description: "优先 — 用 CLI 直接调应用（如终端发 Gmail），或走 Nango 托管授权",
		match: (conn) => conn.id === "gmail" || conn.id === "nango",
	},
	{
		id: "browser",
		title: "操作浏览器",
		description: "网页里读内容、点按钮、填表单",
		match: (conn) => conn.id === "cdp",
	},
	{
		id: "computer",
		title: "操作电脑",
		description: "截屏读屏，或用 UI-TARS 在桌面 App 里点按",
		match: (conn) => conn.id === "screen" || conn.id === "uitars",
	},
	{
		id: "subagents",
		title: "本地 Subagent",
		description: "复杂任务交给本机大模型 Agent 执行（写代码、改项目）",
		match: (conn) => isAgentConnection(conn.id) || conn.id === "workbuddy",
	},
];

function groupConnections(connections: HomeConnection[]) {
	return CONNECTION_GROUPS.map((group) => ({
		...group,
		items: connections.filter(group.match),
	})).filter((group) => group.items.length > 0);
}

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
		case "nango":
			if (conn.status === "error") {
				return [
					{ id: "nango:settings", label: "去配置 Key", primary: true },
					{ id: "nango:dashboard", label: "打开 Nango 控制台" },
				];
			}
			return [
				{ id: "nango:connect", label: "授权新应用", primary: true },
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
				action.id !== "claude:login-terminal" &&
				action.id !== "nango:connect" &&
				action.id !== "nango:dashboard"
			) {
				await onRefresh();
			}
		} finally {
			setBusyId(null);
		}
	};

	const groups = groupConnections(snapshot.connections);

	const renderRow = (conn: HomeConnection) => {
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

			<div className="space-y-5">
				{groups.map((group) => (
					<section key={group.id} className="fold-home-connections-section">
						<div className="fold-home-connections-section-head">
							<h3 className="fold-home-connections-section-title">{group.title}</h3>
							<p className="fold-home-connections-section-desc">{group.description}</p>
						</div>
						<div className="space-y-3">{group.items.map(renderRow)}</div>
					</section>
				))}
			</div>

			<p className="fold-home-footnote">
				Fold 优先走操作应用；不够用再选浏览器或操作电脑；写代码等复杂任务走 Subagent。
			</p>
		</div>
	);
}
