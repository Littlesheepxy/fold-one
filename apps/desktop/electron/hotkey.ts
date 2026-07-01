import { globalShortcut } from "electron";

/** Alt+Space toggles; Escape cancels while recording. */
export function startToggleHotkey(onToggle: () => void, onCancel: () => void): () => void {
	globalShortcut.register("Alt+Space", onToggle);
	globalShortcut.register("Escape", onCancel);
	return () => {
		globalShortcut.unregister("Alt+Space");
		globalShortcut.unregister("Escape");
	};
}
