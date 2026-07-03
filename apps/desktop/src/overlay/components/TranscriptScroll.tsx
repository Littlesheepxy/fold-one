import { ScrollingLine } from "./ScrollingLine";

interface Props {
	text: string;
	placeholder?: string;
}

/** Fixed subtitle window; newer text stays visible on the right. */
export function TranscriptScroll({ text, placeholder = "正在听…" }: Props) {
	return (
		<div className="flex-1 min-w-0 max-w-[210px]">
			<ScrollingLine text={text || placeholder} className="text-sm" scrollAlign="end" />
		</div>
	);
}
