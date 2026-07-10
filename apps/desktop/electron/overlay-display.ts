import { type BrowserWindow, type Display, type Rectangle, screen } from "electron";
import { runAppleScript } from "@fold/connectors";

const SELF_APP_NAMES = new Set(["electron", "fold", "fold-runtime"]);
const VOICE_TAB_BOTTOM_INSET = 30;

function escapeAppleScript(value: string): string {
	return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function parsePoint(raw: string): { x: number; y: number } | null {
	const match = raw.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
	if (!match) return null;
	const x = Number(match[1]);
	const y = Number(match[2]);
	if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
	return { x, y };
}

function buildAppAnchorScript(appName: string, cursorX: number, cursorY: number): string {
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
            return (${cursorX} as text) & "," & (${cursorY} as text)
          end if
        end try
      end repeat
      try
        set win to window 1
        set {x, y} to position of win
        set {wd, ht} to size of win
        return ((x + (wd / 2)) as text) & "," & ((y + (ht / 2)) as text)
      end try
    end tell
  end try
  return ""
end tell`.trim();
}

const FRONT_WINDOW_CENTER_SCRIPT = `
tell application "System Events"
  set proc to first application process whose frontmost is true
  set procName to name of proc
  if procName is "Electron" or procName is "Fold" then return ""
  try
    set win to window 1 of proc
    set {x, y} to position of win
    set {w, h} to size of win
    return ((x + (w / 2)) as text) & "," & ((y + (h / 2)) as text)
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
	bottom: number;
}

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

function computeVoiceTabPlacement(display: Display, overlayBounds: Rectangle): VoiceTabPlacement {
	const { workArea } = display;
	const centerX = workArea.x + workArea.width / 2;
	const bottomY = workArea.y + workArea.height - VOICE_TAB_BOTTOM_INSET;
	return {
		left: centerX - overlayBounds.x,
		bottom: overlayBounds.y + overlayBounds.height - bottomY,
	};
}

async function resolveAnchorDisplay(targetApp?: string | null): Promise<Display> {
	const cursor = screen.getCursorScreenPoint();
	const cursorDisplay = screen.getDisplayNearestPoint(cursor);

	if (process.platform === "darwin") {
		const app = targetApp?.trim();
		if (app && !SELF_APP_NAMES.has(app.toLowerCase())) {
			try {
				const raw = await runAppleScript(buildAppAnchorScript(app, cursor.x, cursor.y), 2500);
				const point = parsePoint(raw);
				if (point) return screen.getDisplayNearestPoint(point);
			} catch {
				// fall through
			}
		}

		try {
			const raw = await runAppleScript(FRONT_WINDOW_CENTER_SCRIPT, 2500);
			const point = parsePoint(raw);
			if (point) return screen.getDisplayNearestPoint(point);
		} catch {
			// fall through
		}
	}

	return cursorDisplay;
}

function applyOverlayBounds(window: BrowserWindow, bounds: Rectangle): void {
	window.setBounds(bounds);
}

/** Span all displays and compute voice-tab placement for the anchor screen. */
export async function positionOverlayForActiveContext(
	window: BrowserWindow | null,
	targetApp?: string | null,
): Promise<VoiceTabPlacement | null> {
	if (!window || window.isDestroyed()) return null;

	const span = getOverlaySpanBounds();
	const display = await resolveAnchorDisplay(targetApp);
	const placement = computeVoiceTabPlacement(display, span);
	applyOverlayBounds(window, span);

	const bounds = window.getBounds();
	console.log(
		`[fold:overlay-display] targetApp=${targetApp ?? "—"} display=${display.id} placement=${placement.left},${placement.bottom} span=${bounds.x},${bounds.y} ${bounds.width}x${bounds.height}`,
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
