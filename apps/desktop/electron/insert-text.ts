import { clipboard } from "electron";
import { runAppleScript } from "@fold/connectors";

function escapeAppleScript(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

/** 复制文本；激活目标 App 后 Cmd+V 粘贴（需辅助功能权限）。 */
export async function insertTextToFrontApp(
	text: string,
	targetApp?: string | null,
): Promise<{ ok: boolean; pasted: boolean }> {
	const trimmed = text.trim();
	if (!trimmed) return { ok: false, pasted: false };
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
	}
}
