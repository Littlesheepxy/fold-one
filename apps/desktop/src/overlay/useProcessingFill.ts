import { useEffect, useRef, useState } from "react";

const FORMAT_STATUSES = new Set(["formatting"]);
const FILL_COMPLETE = 0.98;
const DONE_ANIM_MS = 320;

/** 转写整理进度条：缓慢逼近 ~88%，完成时补到 100% 再出对勾。 */
export function useProcessingFill(status: string, enabled = true): number {
	const [fill, setFill] = useState(0);
	const rafRef = useRef(0);
	const fillRef = useRef(0);

	useEffect(() => {
		cancelAnimationFrame(rafRef.current);

		if (!enabled) {
			fillRef.current = 0;
			setFill(0);
			return;
		}

		if (status === "done") {
			const startFill = fillRef.current;
			if (startFill >= FILL_COMPLETE) {
				fillRef.current = 1;
				setFill(1);
				return;
			}
			const start = performance.now();
			const loop = (now: number) => {
				const t = Math.min(1, (now - start) / DONE_ANIM_MS);
				const next = startFill + (1 - startFill) * t;
				fillRef.current = next;
				setFill(next);
				if (t < 1) rafRef.current = requestAnimationFrame(loop);
			};
			rafRef.current = requestAnimationFrame(loop);
			return () => cancelAnimationFrame(rafRef.current);
		}

		if (!FORMAT_STATUSES.has(status)) {
			fillRef.current = 0;
			setFill(0);
			return;
		}

		const start = performance.now();
		const loop = (now: number) => {
			const elapsed = now - start;
			const next = Math.min(0.88, elapsed / 420);
			fillRef.current = next;
			setFill(next);
			rafRef.current = requestAnimationFrame(loop);
		};

		fillRef.current = 0;
		setFill(0);
		rafRef.current = requestAnimationFrame(loop);
		return () => cancelAnimationFrame(rafRef.current);
	}, [enabled, status]);

	return fill;
}

export const PROCESSING_FILL_COMPLETE = FILL_COMPLETE;
