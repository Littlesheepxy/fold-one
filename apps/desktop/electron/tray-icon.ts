import { readFileSync } from "node:fs";
import { join } from "node:path";
import { nativeImage } from "electron";

const MODULE_DIR = __dirname;
const ASSET_ROOTS = [join(MODULE_DIR, "../public"), join(MODULE_DIR, "../dist")];

const TRAY_LOGICAL_PT = 28;
const TRAY_SCALE = 2;

function resolveAsset(filenames: string[]): string | null {
	for (const name of filenames) {
		for (const root of ASSET_ROOTS) {
			const candidate = join(root, name);
			try {
				readFileSync(candidate);
				return candidate;
			} catch {
				/* try next */
			}
		}
	}
	return null;
}

function trayImageFromPng(png: Buffer, scaleFactor = TRAY_SCALE, template = false) {
	const image = nativeImage.createFromBuffer(png, { scaleFactor });
	if (template) image.setTemplateImage(true);
	return image;
}

/** macOS menu bar tray — mono 白鸟保留眼/翅线，不用 template（template 会把内部细节压成实心） */
export function createZhigengTrayImage() {
	const custom2x = resolveAsset(["zhigeng-tray@2x.png"]);
	if (custom2x) {
		return trayImageFromPng(readFileSync(custom2x), TRAY_SCALE, false);
	}

	const custom = resolveAsset(["zhigeng-tray.png"]);
	if (custom) {
		const image = nativeImage.createFromPath(custom);
		if (image.isEmpty()) throw new Error(`Failed to load icon: ${custom}`);
		const { width } = image.getSize();
		const scaleFactor = width >= TRAY_LOGICAL_PT * 2 ? TRAY_SCALE : 1;
		return trayImageFromPng(readFileSync(custom), scaleFactor, false);
	}

	throw new Error("zhigeng-tray asset not found");
}

/** Dock / app icon. */
export function createZhigengAppIcon() {
	for (const name of ["zhigeng-app-icon.png", "zhigeng-app-icon.icns"]) {
		const custom = resolveAsset([name]);
		if (!custom) continue;
		const image = nativeImage.createFromPath(custom);
		if (!image.isEmpty()) return image;
	}
	throw new Error("zhigeng-app-icon asset not found");
}

/** @deprecated */
export const createFoldTrayImage = createZhigengTrayImage;
/** @deprecated */
export const createFoldAppIcon = createZhigengAppIcon;
