import { useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import type { CapabilityItem } from "../types.js";
import { ConnectionIcon, CONNECTION_CHIP_ICON_SIZE } from "./ConnectionIcon.js";
import { IosSwitch, StatusDot } from "./FormFields.js";

function chipConnectionId(cap: CapabilityItem): string {
	if (cap.connectTarget) return cap.connectTarget;
	if (cap.id === "mail.gmail") return "gmail";
	if (cap.id.startsWith("im.")) return `office-${cap.id.slice(3)}`;
	if (cap.id === "browser.read") return "cdp";
	if (cap.id === "screen.read") return "screen";
	if (cap.id === "apps.hub") return "nango";
	return cap.id;
}

function connectionDotStatus(cap: CapabilityItem): "ok" | "off" {
	return cap.status === "ready" ? "ok" : "off";
}

export function ChannelChipGrid({
	items,
	busy,
	onChipClick,
	onToggle,
}: {
	items: CapabilityItem[];
	busy?: boolean;
	onChipClick: (cap: CapabilityItem) => void;
	onToggle?: (cap: CapabilityItem, enabled: boolean) => void;
}) {
	if (items.length === 0) return null;

	return (
		<div className="fold-connection-chip-grid">
			{items.map((cap) => {
				const needsAction = cap.status === "needs_connect" || cap.status === "needs_fold_hub";
				const connected = cap.status === "ready";
				return (
					<div
						key={cap.id}
						className={`fold-connection-chip${connected && cap.enabled ? " is-enabled" : ""}`}
					>
						<button
							type="button"
							disabled={busy}
							className={`fold-connection-chip-main${needsAction ? " needs-action" : ""}`}
							title={cap.detail ?? cap.description}
							onClick={() => {
								if (needsAction) onChipClick(cap);
							}}
						>
							<span className="fold-connection-chip-icon" aria-hidden="true">
								<ConnectionIcon id={chipConnectionId(cap)} size={CONNECTION_CHIP_ICON_SIZE} />
							</span>
							<span className="fold-connection-chip-label">{cap.label}</span>
							<StatusDot status={connectionDotStatus(cap)} />
						</button>
						{connected && onToggle ? (
							<IosSwitch
								checked={cap.enabled}
								disabled={busy}
								ariaLabel={`启用 ${cap.label}`}
								onChange={(enabled) => onToggle(cap, enabled)}
							/>
						) : needsAction ? (
							<button
								type="button"
								className="fold-connection-chip-link"
								disabled={busy}
								onClick={() => onChipClick(cap)}
							>
								连接
							</button>
						) : null}
					</div>
				);
			})}
		</div>
	);
}

export function CapabilityGroup({
	id,
	label,
	ready,
	total,
	defaultOpen = true,
	busy,
	onRefresh,
	children,
}: {
	id: string;
	label: string;
	ready: number;
	total: number;
	defaultOpen?: boolean;
	busy?: boolean;
	onRefresh?: () => void;
	children: React.ReactNode;
}) {
	const [open, setOpen] = useState(defaultOpen);

	return (
		<section className="fold-capability-group" data-group={id}>
			<button
				type="button"
				className="fold-capability-group-head"
				onClick={() => setOpen((v) => !v)}
			>
				<span className="fold-capability-group-title">{label}</span>
				<span className="fold-capability-group-meta">
					{ready}/{total}
				</span>
				{onRefresh ? (
					<span
						role="button"
						tabIndex={0}
						className="fold-capability-group-refresh"
						onClick={(e) => {
							e.stopPropagation();
							if (!busy) onRefresh();
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter" && !busy) onRefresh();
						}}
						aria-label="刷新"
					>
						<RefreshCw size={12} className={busy ? "animate-spin" : undefined} />
					</span>
				) : null}
				<ChevronDown size={14} className={`fold-capability-group-chevron${open ? " is-open" : ""}`} />
			</button>
			{open ? <div className="fold-capability-group-body">{children}</div> : null}
		</section>
	);
}
