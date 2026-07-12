#!/usr/bin/env node
/**
 * Compose Dock / tray / overlay marks from brand sources.
 * macOS sips cannot resolve external xlink:href in SVG — embed images as base64.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC = join(ROOT, "public");
const BRAND = join(PUBLIC, "brand");
const MASTER = join(BRAND, "zhigeng-robin-master.png");
const MONO = join(BRAND, "zhigeng-robin-mono.png");
const NORMALIZED = join(BRAND, "zhigeng-robin-normalized.png");
const DOCK_BIRD = join(BRAND, "zhigeng-robin-dock.png");
const KNOCK_OUT = join(dirname(fileURLToPath(import.meta.url)), "knock-out-bg.swift");

function run(cmd, args, cwd = BRAND) {
	execFileSync(cmd, args, { cwd, stdio: "inherit" });
}

function resizePng(src, out, size) {
	run("sips", ["-z", String(size), String(size), src, "--out", out], dirname(src));
}

function normalizeMaster() {
	if (!existsSync(MASTER)) {
		console.error(`Missing ${MASTER}`);
		process.exit(1);
	}
	mkdirSync(BRAND, { recursive: true });
	run("sips", ["-s", "format", "png", MASTER, "--out", NORMALIZED]);
	run("swift", [KNOCK_OUT, NORMALIZED, DOCK_BIRD]);
}

function pngBase64(path) {
	return readFileSync(path).toString("base64");
}

function writeDockSvg() {
	const birdB64 = pngBase64(DOCK_BIRD);
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="56" y="56" width="912" height="912" rx="208" ry="208" fill="#FFFFFF"/>
  <image xlink:href="data:image/png;base64,${birdB64}" x="148" y="148" width="728" height="728" preserveAspectRatio="xMidYMid meet"/>
</svg>`;
	const path = join(BRAND, "zhigeng-dock.svg");
	writeFileSync(path, body);
	return path;
}

function rasterizeSvg(svgPath, outPath, size) {
	run("sips", ["-s", "format", "png", svgPath, "--out", outPath]);
	if (size) resizePng(outPath, outPath, size);
}

function buildIcns(appIconPng) {
	const iconset = join(PUBLIC, "zhigeng-app-icon.iconset");
	const icns = join(PUBLIC, "zhigeng-app-icon.icns");
	rmSync(iconset, { recursive: true, force: true });
	mkdirSync(iconset, { recursive: true });
	const sizes = [
		[16, "icon_16x16.png"],
		[32, "icon_16x16@2x.png"],
		[32, "icon_32x32.png"],
		[64, "icon_32x32@2x.png"],
		[128, "icon_128x128.png"],
		[256, "icon_128x128@2x.png"],
		[256, "icon_256x256.png"],
		[512, "icon_256x256@2x.png"],
		[512, "icon_512x512.png"],
	];
	for (const [size, name] of sizes) {
		const out = join(iconset, name);
		run("sips", ["-z", String(size), String(size), appIconPng, "--out", out], ROOT);
	}
	run("cp", [appIconPng, join(iconset, "icon_512x512@2x.png")], ROOT);
	run("iconutil", ["-c", "icns", iconset, "-o", icns], ROOT);
	rmSync(iconset, { recursive: true, force: true });
	return icns;
}

function resolveMonoSource() {
	if (existsSync(MONO)) return MONO;
	console.warn(`Missing ${MONO} — falling back to invert from color master`);
	const fallback = join(BRAND, "zhigeng-robin-mono-fallback.png");
	const birdB64 = pngBase64(NORMALIZED);
	const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1024" height="1024" viewBox="0 0 1024 1024">
  <image xlink:href="data:image/png;base64,${birdB64}" width="1024" height="1024" preserveAspectRatio="xMidYMid meet"
    style="filter: brightness(0) invert(1);"/>
</svg>`;
	const svgPath = join(BRAND, "zhigeng-mono-fallback.svg");
	writeFileSync(svgPath, svg);
	rasterizeSvg(svgPath, fallback, 1024);
	return fallback;
}

normalizeMaster();

const dockSvgPath = writeDockSvg();
const appIcon = join(PUBLIC, "zhigeng-app-icon.png");
rasterizeSvg(dockSvgPath, appIcon, 1024);
buildIcns(appIcon);

const monoSource = resolveMonoSource();
const tray2x = join(PUBLIC, "zhigeng-tray@2x.png");
const tray = join(PUBLIC, "zhigeng-tray.png");
const overlayMark = join(PUBLIC, "zhigeng-mark-mono.png");
const colorMark = join(PUBLIC, "zhigeng-mark.png");

resizePng(monoSource, tray2x, 36);
resizePng(monoSource, tray, 18);
resizePng(monoSource, overlayMark, 128);
resizePng(DOCK_BIRD, colorMark, 192);

const favicon = join(PUBLIC, "zhigeng-favicon.png");
run("sips", ["-z", "32", "32", appIcon, "--out", favicon], ROOT);

console.log("Composed:");
console.log(" ", appIcon);
console.log(" ", join(PUBLIC, "zhigeng-app-icon.icns"));
console.log(" ", tray, tray2x, "(mono tray)");
console.log(" ", overlayMark, "(overlay mono)");
console.log(" ", colorMark, "(sidebar color)");
console.log(" ", favicon);
