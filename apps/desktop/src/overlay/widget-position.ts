/** Overlay-local rectangle (origin = top-left of multi-monitor span window). */
export interface DisplayBounds {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const EDGE_GAP = 12;
export const ORB_SIZE = 44;
export const DOCKED_WIDTH = 70;
export const SNAP_THRESHOLD = 28;
export const DOCK_PEEK = 46;

export type SnapSide = "left" | "right" | null;

export interface WidgetPosition {
	x: number;
	y: number;
	snapSide?: SnapSide;
}

export function clampY(y: number, area: DisplayBounds) {
	return Math.min(Math.max(area.y + EDGE_GAP, y), area.y + area.height - ORB_SIZE - EDGE_GAP);
}

export function clampDragX(x: number, area: DisplayBounds) {
	return Math.min(Math.max(area.x + EDGE_GAP, x), area.x + area.width - ORB_SIZE - EDGE_GAP);
}

export function resolveSnapSide(x: number, area: DisplayBounds): SnapSide {
	if (x <= area.x + SNAP_THRESHOLD) return "left";
	if (x + ORB_SIZE >= area.x + area.width - SNAP_THRESHOLD) return "right";
	return null;
}

export function dockedX(side: Exclude<SnapSide, null>, area: DisplayBounds) {
	return side === "left"
		? area.x - (DOCKED_WIDTH - DOCK_PEEK)
		: area.x + area.width - DOCK_PEEK;
}

export function clampWidgetPosition(pos: WidgetPosition, area: DisplayBounds): WidgetPosition {
	const snapSide = pos.snapSide ?? resolveSnapSide(pos.x, area);
	return {
		x: snapSide ? dockedX(snapSide, area) : clampDragX(pos.x, area),
		y: clampY(pos.y, area),
		snapSide,
	};
}

export function expandedX(anchorX: number, width: number, snapSide: SnapSide, area: DisplayBounds) {
	const dockInset = DOCKED_WIDTH - DOCK_PEEK;
	if (snapSide === "left") return area.x - dockInset;
	if (snapSide === "right") return area.x + area.width - width + dockInset;
	return Math.min(
		Math.max(area.x + EDGE_GAP, anchorX),
		Math.max(area.x + EDGE_GAP, area.x + area.width - width - EDGE_GAP),
	);
}

export function defaultWidgetPosition(area: DisplayBounds): WidgetPosition {
	return clampWidgetPosition(
		{
			x: area.x + area.width - ORB_SIZE,
			y: area.y + Math.round(area.height * 0.55),
			snapSide: "right",
		},
		area,
	);
}

export function isPositionInArea(pos: WidgetPosition, area: DisplayBounds): boolean {
	const cx = pos.x + ORB_SIZE / 2;
	const cy = pos.y + ORB_SIZE / 2;
	return cx >= area.x && cy >= area.y && cx <= area.x + area.width && cy <= area.y + area.height;
}

export function isUsableSavedPosition(pos: WidgetPosition, area: DisplayBounds): boolean {
	if (!isPositionInArea(pos, area)) return false;
	// ponytail: reject pre-bootstrap top-left (0,0) / (12,12) before snap runs
	const nearLeft = pos.x <= area.x + SNAP_THRESHOLD + ORB_SIZE;
	if (nearLeft && pos.snapSide !== "left") return false;
	return true;
}
