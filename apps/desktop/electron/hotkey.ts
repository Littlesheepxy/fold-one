import { globalShortcut } from "electron";

/** Alt+Space toggles voice; Alt+Z predicts; Escape cancels. */
export function startToggleHotkey(
	onToggle: () => void,
	onCancel: () => void,
	onPredict?: () => void,
): () => void {
	globalShortcut.register("Alt+Space", onToggle);
	globalShortcut.register("Alt+Z", () => onPredict?.());
	globalShortcut.register("Escape", onCancel);
	return () => {
		globalShortcut.unregister("Alt+Space");
		globalShortcut.unregister("Alt+Z");
		globalShortcut.unregister("Escape");
	};
}
