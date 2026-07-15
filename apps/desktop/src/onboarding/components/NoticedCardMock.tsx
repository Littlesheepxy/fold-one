import { Sparkles } from "lucide-react";

export function NoticedCardMock({
	text,
	suggestions = ["起草回复", "整理纪要"],
}: {
	text: string;
	suggestions?: string[];
}) {
	return (
		<section className="fold-aha-panel fold-onboarding-noticed-mock" aria-label="知更 注意到了">
			<div className="fold-aha-head-row">
				<div className="fold-aha-title">
					<Sparkles size={14} strokeWidth={1.8} />
					<span>知更 注意到了</span>
					<span className="fold-aha-confidence fold-aha-confidence--medium">大致猜测</span>
				</div>
			</div>
			<p className="fold-aha-reply">{text}</p>
			<div className="fold-aha-chips">
				{suggestions.map((label) => (
					<span key={label} className="fold-aha-chip">
						{label}
					</span>
				))}
			</div>
		</section>
	);
}
