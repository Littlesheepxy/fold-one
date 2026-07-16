import { clipboard, type Data, type NativeImage } from "electron";
import { runAppleScript } from "@fold/connectors";
import * as macosInput from "@fold/macos-input";

export interface TextInsertionTarget {
	ok: boolean;
	pid?: number;
	appName?: string;
	bundleId?: string;
	role?: string;
	editable?: boolean;
	accessibilityTrusted: boolean;
	error?: string;
}

export interface TextInsertionResult {
	ok: boolean;
	pasted: boolean;
	method?: "quartz" | "accessibility" | "applescript";
	verified?: boolean;
	error?: string;
}

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

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function nativeAvailable(): boolean {
	return process.platform === "darwin" && typeof macosInput.captureTarget === "function";
}

export function captureTextInsertionTarget(): TextInsertionTarget | null {
	if (!nativeAvailable()) return null;
	try {
		const target = macosInput.captureTarget();
		console.log(
			`[fold:voice-target] pid=${target.pid ?? "—"} app=${target.appName ?? "—"} role=${target.role ?? "—"} editable=${target.editable ?? false} ax=${target.accessibilityTrusted}`,
		);
		return target;
	} catch (error) {
		console.warn("[fold:voice-target] native capture failed", error);
		return null;
	}
}

export function clearTextInsertionTarget(): void {
	if (!nativeAvailable()) return;
	try {
		macosInput.clearTarget();
	} catch {
		// The native target is best-effort cleanup only.
	}
}

function textStateChanged(
	before: ReturnType<typeof macosInput.inspectTarget>,
	after: ReturnType<typeof macosInput.inspectTarget>,
): boolean | undefined {
	if (!before.available || !after.available) return undefined;
	return (
		before.length !== after.length ||
		before.selectedLocation !== after.selectedLocation ||
		before.selectedLength !== after.selectedLength
	);
}

async function pasteWithQuartz(): Promise<{
	pasted: boolean;
	verified?: boolean;
	error?: string;
}> {
	if (!nativeAvailable()) return { pasted: false, error: "native-input-unavailable" };
	try {
		const before = macosInput.inspectTarget();
		const dispatch = macosInput.postPaste();
		if (!dispatch.ok) {
			return { pasted: false, error: dispatch.error ?? "quartz-event-failed" };
		}
		await sleep(520);
		const after = macosInput.inspectTarget();
		const verified = textStateChanged(before, after);
		return {
			pasted: true,
			...(verified !== undefined ? { verified } : {}),
		};
	} catch (error) {
		return {
			pasted: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function pasteWithAppleScript(targetApp?: string | null): Promise<{
	pasted: boolean;
	verified?: boolean;
	error?: string;
}> {
	const app = targetApp?.trim();
	const before = nativeAvailable() ? macosInput.inspectTarget() : null;
	try {
		const activate = app
			? `tell application "${escapeAppleScript(app)}" to activate\ndelay 0.18\n`
			: "";
		await runAppleScript(
			`
${activate}tell application "System Events"
  key code 9 using command down
end tell
delay 0.35
`.trim(),
			5000,
		);
		const after = nativeAvailable() ? macosInput.inspectTarget() : null;
		const verified = before && after ? textStateChanged(before, after) : undefined;
		return {
			pasted: verified !== false,
			...(verified !== undefined ? { verified } : {}),
			...(verified === false ? { error: "target-text-unchanged" } : {}),
		};
	} catch (error) {
		return {
			pasted: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

async function insertWithAccessibility(text: string): Promise<{
	pasted: boolean;
	verified?: boolean;
	error?: string;
}> {
	if (!nativeAvailable()) return { pasted: false, error: "native-input-unavailable" };
	try {
		const before = macosInput.inspectTarget();
		const inserted = macosInput.insertTextDirect(text);
		if (!inserted.ok) return { pasted: false, error: inserted.error };
		await sleep(80);
		const after = macosInput.inspectTarget();
		const verified = textStateChanged(before, after);
		return {
			pasted: verified !== false,
			...(verified !== undefined ? { verified } : {}),
			...(verified === false ? { error: "target-text-unchanged" } : {}),
		};
	} catch (error) {
		return {
			pasted: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

/** Inserts into the target captured when voice recording started, then restores the clipboard safely. */
export async function insertTextToFrontApp(
	text: string,
	targetApp?: string | null,
): Promise<TextInsertionResult> {
	const trimmed = text.trim();
	if (!trimmed) return { ok: false, pasted: false, error: "empty-text" };

	const previousClipboard = readClipboardSnapshot();
	clipboard.writeText(trimmed);
	const expectedChangeCount = nativeAvailable() ? macosInput.pasteboardChangeCount() : null;

	let result: TextInsertionResult;
	const quartz = await pasteWithQuartz();
	if (quartz.pasted && quartz.verified !== false) {
		result = {
			ok: true,
			pasted: true,
			method: "quartz",
			...(quartz.verified !== undefined ? { verified: quartz.verified } : {}),
		};
	} else {
		console.warn(
			`[fold:voice-insert] Quartz did not change targetApp=${targetApp ?? "—"} error=${quartz.error ?? "target-text-unchanged"}; trying AX insertion`,
		);
		const accessibility = await insertWithAccessibility(trimmed);
		if (accessibility.pasted) {
			result = {
				ok: true,
				pasted: true,
				method: "accessibility",
				...(accessibility.verified !== undefined
					? { verified: accessibility.verified }
					: {}),
			};
		} else {
			console.warn(
				`[fold:voice-insert] AX insertion failed error=${accessibility.error ?? "unknown"}; trying AppleScript fallback`,
			);
			const fallback = await pasteWithAppleScript(targetApp);
			result = fallback.pasted
				? {
						ok: true,
						pasted: true,
						method: "applescript",
						...(fallback.verified !== undefined ? { verified: fallback.verified } : {}),
					}
				: {
						ok: false,
						pasted: false,
						error: [quartz.error, accessibility.error, fallback.error]
							.filter(Boolean)
							.join("; "),
					};
		}
	}

	// A different change count means the user or target app replaced the clipboard; never overwrite it.
	await sleep(120);
	const mayRestore =
		expectedChangeCount === null || macosInput.pasteboardChangeCount() === expectedChangeCount;
	if (mayRestore) {
		restoreClipboardSnapshot(previousClipboard);
	} else {
		console.log("[fold:voice-insert] clipboard changed externally; skipped restore");
	}

	console.log(
		`[fold:voice-insert] targetApp=${targetApp ?? "—"} method=${result.method ?? "none"} pasted=${result.pasted} verified=${result.verified ?? "unknown"}`,
	);
	return result;
}

/** Reverts the most recent insertion after an explicit user click. */
export async function undoTextInsertion(targetApp?: string | null): Promise<{ ok: boolean; error?: string }> {
	const app = targetApp?.trim();
	try {
		const activate = app
			? `tell application "${escapeAppleScript(app)}" to activate\ndelay 0.18\n`
			: "";
		await runAppleScript(
			`${activate}tell application "System Events"\n  keystroke "z" using command down\nend tell`,
			5000,
		);
		return { ok: true };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}
