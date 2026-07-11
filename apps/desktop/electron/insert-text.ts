import { clipboard, type Data, type NativeImage } from "electron";
import { runAppleScript } from "@fold/connectors";

function escapeAppleScript(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function readClipboardSnapshot(): Data {
	const snapshot: Data = {};
	const text = clipboard.readText();
	if (text) snapshot.text = text;
	const html = clipboard.readHTML();
	if (html) snapshot.html = html;
	const image = clipboard.readImage();
	if (!image.isEmpty()) snapshot.image = image;
	return snapshot;
}

function restoreClipboardSnapshot(snapshot: Data): void {
	if (!snapshot.text && !snapshot.html && !snapshot.image) {
		clipboard.clear();
		return;
	}
	const payload: Data = {};
	if (snapshot.text) payload.text = snapshot.text;
	if (snapshot.html) payload.html = snapshot.html;
	const image = snapshot.image as NativeImage | undefined;
	if (image && !image.isEmpty()) payload.image = image;
	clipboard.write(payload);
}

/** 复制文本；激活目标 App 后 Cmd+V 粘贴（需辅助功能权限）。粘贴后恢复用户原剪贴板。 */
export async function insertTextToFrontApp(
	text: string,
	targetApp?: string | null,
): Promise<{ ok: boolean; pasted: boolean }> {
	const trimmed = text.trim();
	if (!trimmed) return { ok: false, pasted: false };

	const previousClipboard = readClipboardSnapshot();
	clipboard.writeText(trimmed);
	const app = targetApp?.trim();
	try {
		const activate = app
			? `tell application "${escapeAppleScript(app)}" to activate\ndelay 0.2\n`
			: "";
		await runAppleScript(
			`
${activate}tell application "System Events"
  keystroke "v" using command down
end tell
`.trim(),
			5000,
		);
		return { ok: true, pasted: true };
	} catch {
		return { ok: true, pasted: false };
	} finally {
		restoreClipboardSnapshot(previousClipboard);
	}
}
