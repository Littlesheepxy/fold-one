interface Option {
	id: string;
	label: string;
}

interface Props {
	title?: string | null;
	message?: string | null;
	hint?: string | null;
	options: Option[];
	onSelect: (id: string) => void;
}

export function AskOptions({ title, message, hint, options, onSelect }: Props) {
	return (
		<div className="flex min-w-[300px] max-w-[360px] flex-col gap-2 pointer-events-auto">
			{title && <p className="text-sm font-medium text-white/92">{title}</p>}
			{message && <p className="text-xs leading-relaxed text-white/72">{message}</p>}
			{hint && <p className="text-[11px] leading-relaxed text-white/45">{hint}</p>}
			<div className="flex flex-wrap gap-2 pt-1">
				{options.map((opt) => (
					<button
						key={opt.id}
						type="button"
						onClick={() => onSelect(opt.id)}
						className="px-3 py-1.5 rounded-full text-sm bg-white/15 hover:bg-white/25 transition-colors"
					>
						{opt.label}
					</button>
				))}
			</div>
		</div>
	);
}
