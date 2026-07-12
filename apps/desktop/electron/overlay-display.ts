import { type BrowserWindow, type Display, type Rectangle, screen } from "electron";
import { runAppleScript } from "@fold/connectors";

const SELF_APP_NAMES = new Set(["electron", "fold", "fold-runtime", "知更", "zhigeng"]);
/** 目标窗口底部程序栏/输入区预留高度 */
const PROGRAM_BAR_HEIGHT = 52;
/** 语音条底边距程序栏顶部的间距 */
const VOICE_TAB_ABOVE_BAR = 10;

function escapeAppleScript(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parseBounds(raw: string): Rectangle | null {
	const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)/);
	if (!match) return null;
	const x = Number(match[1]);
	const y = Number(match[2]);
	const width = Number(match[3]);
	const height = Number(match[4]);
	if (![x, y, width, height].every(Number.isFinite)) return null;
	if (width <= 0 || height <= 0) return null;
	return { x, y, width, height };
}

function buildAppWindowBoundsScript(appName: string, cursorX: number, cursorY: number): string {
	const escaped = escapeAppleScript(appName);
	return `
tell application "System Events"
  try
    tell process "${escaped}"
      repeat with w in windows
        try
          set {x, y} to position of w
          set {wd, ht} to size of w
          if ${cursorX} ≥ x and ${cursorX} ≤ x + wd and ${cursorY} ≥ y and ${cursorY} ≤ y + ht then
            return (x as text) & "," & (y as text) & "," & (wd as text) & "," & (ht as text)
          end if
        end try
      end repeat
      try
        set win to window 1
        set {x, y} to position of win
        set {wd, ht} to size of win
        return (x as text) & "," & (y as text) & "," & (wd as text) & "," & (ht as text)
      end try
    end tell
  end try
  return ""
end tell`.trim();
}

const FRONT_WINDOW_BOUNDS_SCRIPT = `
tell application "System Events"
  set proc to first application process whose frontmost is true
  set procName to name of proc
  if procName is "Electron" or procName is "Fold" or procName is "知更" then return ""
  try
    set win to window 1 of proc
    set {x, y} to position of win
    set {w, h} to size of win
    return (x as text) & "," & (y as text) & "," & (w as text) & "," & (h as text)
  on error
    return ""
  end try
end tell
`.trim();

export interface OverlayWorkArea {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface VoiceTabPlacement {
	left: number;
	top: number;
}

const VOICE_TAB_HEIGHT = 34;

export function getOverlaySpanBounds(): Rectangle {
	const displays = screen.getAllDisplays();
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const display of displays) {
		const { x, y, width, height } = display.bounds;
		minX = Math.min(minX, x);
		minY = Math.min(minY, y);
		maxX = Math.max(maxX, x + width);
		maxY = Math.max(maxY, y + height);
	}
	return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function getOverlayWorkArea(window: BrowserWindow | null): OverlayWorkArea {
	if (window && !window.isDestroyed()) {
		const bounds = window.getBounds();
		return {
			x: bounds.x,
			y: bounds.y,
			width: bounds.width,
			height: bounds.height,
		};
	}
	return screen.getPrimaryDisplay().workArea;
}

function computeVoiceTabPlacement(
	targetWindow: Rectangle,
	overlayBounds: Rectangle,
	display: Display,
): VoiceTabPlacement {
	const { workArea } = display;
	const windowBottom = targetWindow.y + targetWindow.height;
	const workAreaBottom = workArea.y + workArea.height;
	// 窗口矩形常延伸到 Dock 区域；锚定在可见工作区底边之上
	const effectiveBottom = Math.min(windowBottom, workAreaBottom);
	// 水平：当前显示器工作区中心（屏幕视觉中心），非前台窗口中心
	const centerX = workArea.x + workArea.width / 2;
	const topY =
		effectiveBottom -
		PROGRAM_BAR_HEIGHT -
		VOICE_TAB_ABOVE_BAR -
		VOICE_TAB_HEIGHT;
	const clampedTop = Math.min(
		topY,
		workAreaBottom - VOICE_TAB_ABOVE_BAR - VOICE_TAB_HEIGHT,
	);
	return {
		left: centerX - overlayBounds.x,
		top: clampedTop - overlayBounds.y,
	};
}

function fallbackWindowRect(display: Display): Rectangle {
	const { workArea } = display;
	return {
		x: workArea.x,
		y: workArea.y,
		width: workArea.width,
		height: workArea.height,
	};
}

async function resolveTargetWindowRect(targetApp?: string | null): Promise<{
	rect: Rectangle;
	display: Display;
}> {
	const cursor = screen.getCursorScreenPoint();
	const cursorDisplay = screen.getDisplayNearestPoint(cursor);

	if (process.platform === "darwin") {
		const app = targetApp?.trim();
		if (app && !SELF_APP_NAMES.has(app.toLowerCase())) {
			try {
				const raw = await runAppleScript(
					buildAppWindowBoundsScript(app, cursor.x, cursor.y),
					2500,
				);
				const rect = parseBounds(raw);
				if (rect) {
					const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
					return { rect, display: screen.getDisplayNearestPoint(center) };
				}
			} catch {
				// fall through
			}
		}

		try {
			const raw = await runAppleScript(FRONT_WINDOW_BOUNDS_SCRIPT, 2500);
			const rect = parseBounds(raw);
			if (rect) {
				const center = { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
				return { rect, display: screen.getDisplayNearestPoint(center) };
			}
		} catch {
			// fall through
		}
	}

	return { rect: fallbackWindowRect(cursorDisplay), display: cursorDisplay };
}

function applyOverlayBounds(window: BrowserWindow, bounds: Rectangle): void {
	window.setBounds(bounds);
}

/** Span all displays and anchor the voice tab above the target window's bottom bar. */
export async function positionOverlayForActiveContext(
	window: BrowserWindow | null,
	targetApp?: string | null,
): Promise<VoiceTabPlacement | null> {
	if (!window || window.isDestroyed()) return null;

	const span = getOverlaySpanBounds();
	const { rect, display } = await resolveTargetWindowRect(targetApp);
	const placement = computeVoiceTabPlacement(rect, span, display);
	applyOverlayBounds(window, span);

	const bounds = window.getBounds();
	console.log(
		`[fold:overlay-display] targetApp=${targetApp ?? "—"} display=${display.id} workArea=${display.workArea.x},${display.workArea.y} ${display.workArea.width}x${display.workArea.height} window=${rect.x},${rect.y} ${rect.width}x${rect.height} placement=${placement.left},${placement.top} span=${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`,
	);
	return placement;
}

export function cursorPointInOverlay(
	window: BrowserWindow | null,
	point = screen.getCursorScreenPoint(),
): { x: number; y: number } {
	const area = getOverlayWorkArea(window);
	return { x: point.x - area.x, y: point.y - area.y };
}
