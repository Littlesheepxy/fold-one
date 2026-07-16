import { existsSync, readFileSync } from "node:fs";
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

const ICNS_PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * nativeImage.createFromPath() 在 Electron 34 上无法解析 .icns（返回空图），之前用 `sips` 转 PNG 兜底，
 * 但 `sips` 需要 fork 子进程——桌面端自带的文件监听器（chokidar，watch 用户 Desktop/Downloads）在文件
 * 较多时会长期占用 1w+ 个 fd，一旦超过 macOS posix_spawn 的 fd 上限就会让所有子进程调用（不只是 sips）
 * 静默失败（EBADF）。.icns 本质是简单的 TLV 容器，现代应用几乎都直接内嵌 PNG，直接解析取最大的 PNG
 * 分片即可拿到图标，完全不需要 fork 子进程。
 * ponytail: 只认 PNG 分片；2012 年前那批用原始 ARGB/RLE 编码的老 icns 会解析不到图，回退到字母占位，
 * 升级路径是需要时再补一个 ARGB 解码分支。
 */
function extractLargestPngFromIcns(icnsPath: string): Buffer | null {
	let buf: Buffer;
	try {
		buf = readFileSync(icnsPath);
	} catch {
		return null;
	}
	if (buf.length < 8 || buf.toString("ascii", 0, 4) !== "icns") return null;

	let best: Buffer | null = null;
	let offset = 8;
	while (offset + 8 <= buf.length) {
		const chunkLength = buf.readUInt32BE(offset + 4);
		if (chunkLength < 8 || offset + chunkLength > buf.length) break;
		const data = buf.subarray(offset + 8, offset + chunkLength);
		if (data.length > 8 && data.subarray(0, 8).equals(ICNS_PNG_SIGNATURE)) {
			if (!best || data.length > best.length) best = data;
		}
		offset += chunkLength;
	}
	return best;
}

function loadAppIconImage(iconPath: string) {
	const direct = nativeImage.createFromPath(iconPath);
	if (!direct.isEmpty()) return direct;
	if (!iconPath.endsWith(".icns")) return direct;

	const png = extractLargestPngFromIcns(iconPath);
	if (!png) return nativeImage.createEmpty();
	return nativeImage.createFromBuffer(png);
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
