export function KeywordChips({ keywords, title = "识别到的关键词" }: { keywords: string[]; title?: string }) {
	if (!keywords.length) return null;
	return (
		<div className="fold-onboarding-keywords">
			<p className="fold-onboarding-keywords-title">{title}</p>
			<div className="fold-onboarding-keywords-row">
				{keywords.map((kw) => (
					<span key={kw} className="fold-onboarding-keyword-chip">
						{kw}
					</span>
				))}
			</div>
		</div>
	);
}
