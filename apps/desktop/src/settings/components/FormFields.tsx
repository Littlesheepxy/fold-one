import type { ReactNode } from "react";
import { GripHorizontal } from "lucide-react";

export function BooleanField({
	label,
	checked,
	onChange,
	hint,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
	hint?: string;
}) {
	return (
		<label className="fold-home-checkbox">
			<input
				type="checkbox"
				checked={checked}
				onChange={(e) => onChange(e.target.checked)}
				className="mt-0.5"
			/>
			<span className="space-y-1">
				<span className="block text-[13px] font-medium text-[#1d1d1f]">{label}</span>
				{hint && <span className="block text-[11px] leading-relaxed text-[#86868b]">{hint}</span>}
			</span>
		</label>
	);
}

export function Field({
	label,
	value,
	onChange,
	type = "text",
	hint,
	options,
}: {
	label: string;
	value: string;
	onChange: (v: string) => void;
	type?: string;
	hint?: string;
	options?: string[];
}) {
	return (
		<label className="fold-home-field block space-y-1.5">
			<span className="text-[13px] font-medium text-[#1d1d1f]">{label}</span>
			{options ? (
				<select value={value} onChange={(e) => onChange(e.target.value)}>
					{options.map((o) => (
						<option key={o} value={o}>
							{o}
						</option>
					))}
				</select>
			) : (
				<input type={type} value={value} onChange={(e) => onChange(e.target.value)} />
			)}
			{hint && <span className="text-[11px] leading-relaxed text-[#86868b]">{hint}</span>}
		</label>
	);
}

export function Card({
	title,
	children,
	className = "",
	fill = false,
	dragHandle = false,
}: {
	title?: string;
	children: ReactNode;
	className?: string;
	fill?: boolean;
	dragHandle?: boolean;
}) {
	return (
		<div className={`fold-home-card${fill ? " fold-home-card--fill" : ""} ${className}`.trim()}>
			{title && (
				<h3
					className={`fold-home-card-title${dragHandle ? " fold-home-card-drag-handle" : ""}`}
				>
					{dragHandle && <GripHorizontal className="fold-home-card-grip" size={14} strokeWidth={1.75} />}
					{title}
				</h3>
			)}
			<div className={fill ? "fold-home-card-body" : undefined}>{children}</div>
		</div>
	);
}

export function StatusDot({ status }: { status: "ok" | "warn" | "error" }) {
	const color =
		status === "ok" ? "bg-emerald-500" : status === "warn" ? "bg-amber-400" : "bg-[#c7c7cc]";
	return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export function formatTime(ts: number) {
	return new Date(ts).toLocaleString("zh-CN", {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

export function ConnectionBadge({ status }: { status: "ok" | "warn" | "error" }) {
	const label = status === "ok" ? "可用" : status === "warn" ? "待配置" : "不可用";
	const cls =
		status === "ok"
			? "fold-home-badge fold-home-badge-ok"
			: status === "warn"
				? "fold-home-badge fold-home-badge-warn"
				: "fold-home-badge fold-home-badge-error";
	return <span className={cls}>{label}</span>;
}
