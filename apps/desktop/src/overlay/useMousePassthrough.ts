import { useEffect } from "react";

/** Electron overlay must call setIgnoreMouseEvents — CSS pointer-events is not enough. */
export function useMousePassthrough() {
	useEffect(() => {
		window.fold.setMousePassthrough(true);

		const onMove = (e: MouseEvent) => {
			if (document.body.dataset.foldDragging === "true") {
				window.fold.setMousePassthrough(false);
				return;
			}
			const el = document.elementFromPoint(e.clientX, e.clientY);
			const interactive = el?.closest("[data-fold-interactive]");
			window.fold.setMousePassthrough(!interactive);
		};

		window.addEventListener("mousemove", onMove);
		return () => {
			window.removeEventListener("mousemove", onMove);
			window.fold.setMousePassthrough(true);
		};
	}, []);
}
