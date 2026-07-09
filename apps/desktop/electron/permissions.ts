import { app, shell, systemPreferences } from "electron";
import { resolve } from "node:path";

export interface AccessibilityProbe {
	available: boolean;
	/** 系统设置里显示的应用名（开发模式多为 Electron） */
	appLabel: string;
	/** 开发模式可手动「+」添加的 .app 路径 */
	bundlePath?: string;
	error?: string;
}

/** 开发模式下 Electron.app 的绝对路径，供系统设置手动添加 */
export function getAccessibilityBundlePath(): string | undefined {
	if (process.platform !== "darwin") return undefined;
	// execPath → .../Electron.app/Contents/MacOS/Electron
	return resolve(process.execPath, "../../..");
}

export function probeAccessibility(prompt = false): AccessibilityProbe {
	if (process.platform !== "darwin") {
		return { available: true, appLabel: app.getName() };
	}
	const bundlePath = getAccessibilityBundlePath();
	const appLabel = !app.isPackaged ? "Electron" : app.getName() || "Fold";
	const available = systemPreferences.isTrustedAccessibilityClient(prompt);
	const devHint = !app.isPackaged
		? `开发模式请点左下角 +，添加：\n${bundlePath}`
		: `请在系统设置中开启「${appLabel}」`;
	return {
		available,
		appLabel,
		bundlePath: !app.isPackaged ? bundlePath : undefined,
		error: available ? undefined : devHint,
	};
}

export async function openAccessibilitySettings(): Promise<void> {
	await shell.openExternal(
		"x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
	);
}

/** 未授权时弹系统对话框并打开设置页（不依赖正式打包） */
export async function ensureAccessibilityPermission(): Promise<AccessibilityProbe> {
	const ax = probeAccessibility(true);
	if (!ax.available) {
		await openAccessibilitySettings();
	}
	return ax;
}
