/**
 * 本地声明：pnpm file: 原生包偶发把过期 index.d.ts 拷进 store，
 * IDE 会按空类型报错。以 native 源为准。
 */
declare module "@fold/macos-input" {
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
		x: number;
		y: number;
		width: number;
		height: number;
	}

	export interface ScreenBounds {
		x: number;
		y: number;
		width: number;
		height: number;
	}

	export function captureTarget(): InputTarget;
	export function clearTarget(): void;
	export function inspectTarget(): TextState;
	export function postPaste(): PasteDispatchResult;
	export function insertTextDirect(text: string): DirectInsertResult;
	export function pasteboardChangeCount(): number;
	export function idleSeconds(): number;
	export function startFrontAppWatch(
		callback: (change: FrontAppChange) => void,
	): WatchStartResult;
	export function stopFrontAppWatch(): void;
	export function ocrImageFile(path: string, region?: OcrRegion): OcrResult;
	export function mouseScreenBounds(): ScreenBounds;
}
