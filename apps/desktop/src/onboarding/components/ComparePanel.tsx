export function ComparePanel({
	incoming,
	before,
	after,
	checklist,
	showAfter = true,
}: {
	incoming: string;
	before: { transcript: string; reply: string };
	after: { transcript: string; reply: string };
	checklist: string[];
	showAfter?: boolean;
}) {
	return (
		<div className="fold-onboarding-compare">
			<p className="fold-onboarding-compare-incoming">
				<span className="fold-onboarding-compare-label">对方</span>
				{incoming}
			</p>
			<div className="fold-onboarding-compare-cols">
				<div className="fold-onboarding-compare-col">
					<p className="fold-onboarding-compare-col-title">导入前</p>
					<div className="fold-onboarding-compare-card muted">
						<p className="text-[12px] text-[#86868b]">听写</p>
						<p>{before.transcript}</p>
					</div>
					<div className="fold-onboarding-compare-card muted">
						<p className="text-[12px] text-[#86868b]">代回</p>
						<p>{before.reply}</p>
					</div>
				</div>
				{showAfter ? (
					<div className="fold-onboarding-compare-col">
						<p className="fold-onboarding-compare-col-title is-highlight">导入后</p>
						<div className="fold-onboarding-compare-card">
							<p className="text-[12px] text-[#248a3d]">听写</p>
							<p>{after.transcript}</p>
						</div>
						<div className="fold-onboarding-compare-card">
							<p className="text-[12px] text-[#248a3d]">代回</p>
							<p>{after.reply}</p>
						</div>
					</div>
				) : null}
			</div>
			{checklist.length > 0 && showAfter ? (
				<ul className="fold-onboarding-checklist">
					{checklist.map((item) => (
						<li key={item}>✓ {item}</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
