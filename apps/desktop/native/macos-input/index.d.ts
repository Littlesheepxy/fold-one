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
export function insertTextDirect(text: string): DirectInsertResult;
export function pasteboardChangeCount(): number;
export function idleSeconds(): number;
