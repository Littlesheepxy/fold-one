export interface InputTarget {
	ok: boolean;
	pid?: number;
	appName?: string;
	bundleId?: string;
	role?: string;
	editable?: boolean;
	accessibilityTrusted: boolean;
	error?: string;
}

export interface TextState {
	available: boolean;
	length?: number;
	selectedLocation?: number;
	selectedLength?: number;
}

export interface PasteDispatchResult {
	ok: boolean;
	pid?: number;
	focusRestored?: boolean;
	error?: string;
}

export interface DirectInsertResult {
	ok: boolean;
	error?: string;
}

export function captureTarget(): InputTarget;
export function clearTarget(): void;
export function inspectTarget(): TextState;
export function postPaste(): PasteDispatchResult;
export interface FrontAppChange {
	appName: string;
	bundleId: string;
	appPath: string;
	pid: number;
}

export interface WatchStartResult {
	ok: boolean;
	alreadyWatching?: boolean;
	error?: string;
}

export interface OcrResult {
	ok: boolean;
	text?: string;
	lineCount?: number;
	error?: string;
}

export interface OcrRegion {
	/** 归一化坐标，Vision 原点在左下（y=1 是图片顶部） */
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface ScreenBounds {
	/** CG 全局坐标（左上原点，单位 pt），可直接喂 screencapture -R */
	x: number;
	y: number;
	width: number;
	height: number;
}

export function insertTextDirect(text: string): DirectInsertResult;
export function pasteboardChangeCount(): number;
export function idleSeconds(): number;
export function startFrontAppWatch(callback: (change: FrontAppChange) => void): WatchStartResult;
export function stopFrontAppWatch(): void;
export function ocrImageFile(path: string, region?: OcrRegion): OcrResult;
/** 鼠标当前所在屏幕的边界（多屏时用来截「用户正在看」的那块屏，而非固定主屏）。 */
export function mouseScreenBounds(): ScreenBounds;
