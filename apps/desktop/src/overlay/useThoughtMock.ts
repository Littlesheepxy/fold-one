import { useEffect, useRef } from "react";
import type { ResolvedThought, ThoughtPhase } from "@fold/runtime";

const MOCK_INSIGHTS = [
	"他在催进度 · 先给预期",
	"别把时间说死",
	"直译会有点生硬",
] as const;

/** PR1：在真实 Thought Resolver 接入前，用稳定 mock 验证顶底并行 AHA。 */
export function useThoughtMock(opts: {
	enabled: boolean;
	isSpeaking: boolean;
	sourceText: string;
	onThought: (thought: ResolvedThought | null, phase: ThoughtPhase) => void;
}) {
	const stableSinceRef = useRef<number | null>(null);
	const insightRef = useRef<string | null>(null);
	const onThoughtRef = useRef(opts.onThought);
	onThoughtRef.current = opts.onThought;

	useEffect(() => {
		if (!opts.enabled) {
			stableSinceRef.current = null;
			insightRef.current = null;
			onThoughtRef.current(null, "hidden");
			return;
		}

		if (!opts.isSpeaking) {
			stableSinceRef.current = null;
			if (insightRef.current) {
				onThoughtRef.current(
					{
						insight: insightRef.current,
						basis: ["intent_inference"],
						confidence: 0.9,
						noveltyScore: 0.78,
						stableForMs: 800,
					},
					"forming",
				);
			}
			return;
		}

		const text = opts.sourceText.trim();
		if (text.length < 10) {
			stableSinceRef.current = null;
			insightRef.current = null;
			onThoughtRef.current(null, "hidden");
			return;
		}

		const now = Date.now();
		if (!stableSinceRef.current) stableSinceRef.current = now;
		const stableForMs = now - stableSinceRef.current;

		const pick =
			text.includes("翻译") || text.includes("英文")
				? MOCK_INSIGHTS[2]
				: text.includes("回") || text.includes("周") || text.includes("进度")
					? MOCK_INSIGHTS[0]
					: MOCK_INSIGHTS[1];

		insightRef.current = pick;

		onThoughtRef.current(
			{
				insight: pick,
				basis: ["current_context", "intent_inference"],
				confidence: 0.9,
				noveltyScore: 0.78,
				stableForMs,
			},
			stableForMs >= 500 ? "forming" : "hidden",
		);
	}, [opts.enabled, opts.isSpeaking, opts.sourceText]);
}
