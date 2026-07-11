import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeImage } from "electron";

const KNOWN_APP_PATHS: Record<string, string> = {
	Finder: "/System/Library/CoreServices/Finder.app",
	Cursor: "/Applications/Cursor.app",
	"Google Chrome": "/Applications/Google Chrome.app",
	Chrome: "/Applications/Google Chrome.app",
	Arc: "/Applications/Arc.app",
	Mail: "/System/Applications/Mail.app",
	"Microsoft Edge": "/Applications/Microsoft Edge.app",
	Slack: "/Applications/Slack.app",
	Lark: "/Applications/Lark.app",
	Feishu: "/Applications/Lark.app",
	飞书: "/Applications/Lark.app",
	DingTalk: "/Applications/DingTalk.app",
	钉钉: "/Applications/钉钉.app",
	WeCom: "/Applications/WeCom.app",
	企业微信: "/Applications/企业微信.app",
	WeChat: "/Applications/WeChat.app",
	"微信": "/Applications/WeChat.app",
	Electron: "/Applications/Electron.app",
};

/** 按应用名解析 .app bundle 路径（历史 episode 可能只有 appName 没有 appPath） */
export function resolveAppBundlePath(appName: string): string | null {
	const name = appName.trim();
	if (!name) return null;

	const known = KNOWN_APP_PATHS[name];
	if (known && existsSync(known)) return known;

	for (const candidate of [
		`/Applications/${name}.app`,
		`/System/Applications/${name}.app`,
		`/System/Library/CoreServices/${name}.app`,
	]) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

export function resolveAppIconTarget(appPath?: string | null, appName?: string | null): string | null {
	if (appPath?.endsWith(".app") && existsSync(appPath)) return appPath;
	if (appName) return resolveAppBundlePath(appName);
	return null;
}

const convertedPngCache = new Map<string, string>();

function icnsToPngPath(icnsPath: string): string | null {
	const cached = convertedPngCache.get(icnsPath);
	if (cached && existsSync(cached)) return cached;

	const hash = createHash("md5").update(icnsPath).digest("hex");
	const pngPath = join(tmpdir(), `fold-icon-${hash}.png`);
	if (!existsSync(pngPath)) {
		try {
			execFileSync("sips", ["-s", "format", "png", icnsPath, "--out", pngPath], {
				stdio: "pipe",
			});
		} catch {
			return null;
		}
	}
	convertedPngCache.set(icnsPath, pngPath);
	return pngPath;
}

function loadAppIconImage(iconPath: string) {
	const direct = nativeImage.createFromPath(iconPath);
	if (!direct.isEmpty()) return direct;
	if (!iconPath.endsWith(".icns")) return direct;

	const pngPath = icnsToPngPath(iconPath);
	if (!pngPath) return nativeImage.createEmpty();
	return nativeImage.createFromBuffer(readFileSync(pngPath));
}

function resolveAppIconPath(appPath: string): string | null {
	if (!appPath.endsWith(".app")) return null;
	const resources = join(appPath, "Contents", "Resources");
	if (!existsSync(resources)) return null;

	const plistPath = join(appPath, "Contents", "Info.plist");
	try {
		const plist = readFileSync(plistPath, "utf8");
		const match = plist.match(/<key>CFBundleIconFile<\/key>\s*<string>([^<]+)<\/string>/);
		if (match) {
			const name = match[1]!;
			const candidates = [
				join(resources, name.endsWith(".icns") ? name : `${name}.icns`),
				join(resources, name),
			];
			for (const candidate of candidates) {
				if (existsSync(candidate)) return candidate;
			}
		}
	} catch {
		// ignore plist read errors
	}

	const appName = appPath.split("/").pop()?.replace(/\.app$/, "") ?? "";
	for (const candidate of [
		join(resources, `${appName}.icns`),
		join(resources, "AppIcon.icns"),
		join(resources, "app.icns"),
	]) {
		if (existsSync(candidate)) return candidate;
	}
	return null;
}

export function getFirstAppIconDataUrl(appNames: string[]): string | null {
	for (const name of appNames) {
		const dataUrl = getAppIconDataUrl("", name);
		if (dataUrl) return dataUrl;
	}
	return null;
}

export function getAppIconDataUrl(appPath: string, appName?: string | null): string | null {
	const bundlePath = resolveAppIconTarget(appPath, appName);
	if (!bundlePath) return null;
	const iconPath = resolveAppIconPath(bundlePath);
	if (!iconPath) return null;
	const image = loadAppIconImage(iconPath);
	if (image.isEmpty()) return null;
	return image.resize({ width: 64, height: 64 }).toDataURL();
}
