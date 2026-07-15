import { shell } from "electron";
import { runAppleScript } from "@fold/connectors";

function escapeAppleScript(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export async function focusApp(appName: string): Promise<{ ok: boolean }> {
	const name = appName.trim();
	if (!name) return { ok: false };
	try {
		await runAppleScript(`tell application "${escapeAppleScript(name)}" to activate`, 5000);
		return { ok: true };
	} catch {
		return { ok: false };
	}
}

export async function focusUrl(url: string): Promise<{ ok: boolean }> {
	const target = url.trim();
	if (!target) return { ok: false };
	try {
		await shell.openExternal(target);
		return { ok: true };
	} catch {
		return { ok: false };
	}
}
