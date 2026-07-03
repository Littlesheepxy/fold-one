import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { nativeImage } from "electron";

const MODULE_DIR = __dirname;
const ASSET_ROOTS = [join(MODULE_DIR, "../public"), join(MODULE_DIR, "../dist")];

/** Menu bar logical size (pt). Physical pixels = pt × scaleFactor. */
const TRAY_LOGICAL_PT = 18;
const TRAY_SCALE = 2;

function resolveAsset(filenames: string[]): string | null {
	for (const name of filenames) {
		for (const root of ASSET_ROOTS) {
			const candidate = join(root, name);
			if (existsSync(candidate)) return candidate;
		}
	}
	return null;
}

/** sips keeps alpha; qlmanage adds a white canvas and breaks menu bar template icons. */
function rasterizeSvg(svgPath: string, pixelSize: number): Buffer {
	const cacheKey = createHash("md5").update(`${svgPath}:${pixelSize}`).digest("hex");
	const pngPath = join(tmpdir(), `fold-icon-${cacheKey}.png`);
	if (existsSync(pngPath)) return readFileSync(pngPath);

	const rawPath = join(tmpdir(), `fold-icon-${cacheKey}-raw.png`);
	execFileSync("sips", ["-s", "format", "png", svgPath, "--out", rawPath], { stdio: "ignore" });
	execFileSync("sips", ["-z", String(pixelSize), String(pixelSize), rawPath, "--out", pngPath], {
		stdio: "ignore",
	});
	return readFileSync(pngPath);
}

function trayImageFromPng(png: Buffer, scaleFactor = TRAY_SCALE) {
	const image = nativeImage.createFromBuffer(png, { scaleFactor });
	image.setTemplateImage(true);
	return image;
}

/** macOS menu bar tray icon — render @2x to stay sharp on Retina. */
export function createFoldTrayImage() {
	const custom2x = resolveAsset(["fold-tray@2x.png"]);
	if (custom2x) {
		return trayImageFromPng(readFileSync(custom2x), TRAY_SCALE);
	}

	const custom = resolveAsset(["fold-tray.png"]);
	if (custom) {
		const image = nativeImage.createFromPath(custom);
		if (image.isEmpty()) throw new Error(`Failed to load icon: ${custom}`);
		const { width } = image.getSize();
		const scaleFactor = width >= TRAY_LOGICAL_PT * 2 ? TRAY_SCALE : 1;
		return trayImageFromPng(readFileSync(custom), scaleFactor);
	}

	const svgPath = resolveAsset(["fold-tray.svg"]);
	if (!svgPath) throw new Error("fold-tray asset not found");

	const pixelSize = TRAY_LOGICAL_PT * TRAY_SCALE;
	return trayImageFromPng(rasterizeSvg(svgPath, pixelSize), TRAY_SCALE);
}

/** Dock / app icon. PNG first — Electron often fails to load some .icns via createFromPath. */
export function createFoldAppIcon() {
	for (const name of ["fold-app-icon.png", "fold-app-icon@2x.png", "fold-app-icon.icns"]) {
		const custom = resolveAsset([name]);
		if (!custom) continue;
		const image = nativeImage.createFromPath(custom);
		if (!image.isEmpty()) return image;
	}

	const svgPath = resolveAsset(["fold-app-icon.svg"]);
	if (!svgPath) throw new Error("fold-app-icon asset not found");

	return nativeImage.createFromBuffer(rasterizeSvg(svgPath, 1024));
}
