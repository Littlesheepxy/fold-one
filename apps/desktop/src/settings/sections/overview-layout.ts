import type RGL from "react-grid-layout";

export type OverviewWidgetId = "memory" | "tasks" | "todo" | "connections" | "config-gap";

const STORAGE_KEY = "fold:overview-layout";

export const OVERVIEW_COLS = 12;
export const OVERVIEW_ROW_HEIGHT = 28;

export const DEFAULT_OVERVIEW_LAYOUT: RGL.Layout[] = [
	{ i: "memory", x: 0, y: 0, w: 6, h: 5, minW: 4, minH: 4 },
	{ i: "tasks", x: 6, y: 0, w: 6, h: 5, minW: 4, minH: 4 },
	{ i: "todo", x: 0, y: 5, w: 6, h: 4, minW: 4, minH: 3 },
	{ i: "connections", x: 6, y: 5, w: 6, h: 5, minW: 4, minH: 4 },
	{ i: "config-gap", x: 0, y: 10, w: 12, h: 4, minW: 6, minH: 3 },
];

export function visibleOverviewWidgets(showConfigGap: boolean): OverviewWidgetId[] {
	const ids: OverviewWidgetId[] = ["memory", "tasks", "todo", "connections"];
	if (showConfigGap) ids.push("config-gap");
	return ids;
}

export function mergeOverviewLayout(saved: RGL.Layout[], visibleIds: OverviewWidgetId[]): RGL.Layout[] {
	const savedMap = new Map(saved.map((item) => [item.i, item]));
	return DEFAULT_OVERVIEW_LAYOUT.filter((item) => visibleIds.includes(item.i as OverviewWidgetId)).map(
		(item) => {
			const stored = savedMap.get(item.i);
			return stored ? { ...item, ...stored, i: item.i } : item;
		},
	);
}

export function loadOverviewLayout(visibleIds: OverviewWidgetId[]): RGL.Layout[] {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return mergeOverviewLayout([], visibleIds);
		const parsed = JSON.parse(raw) as RGL.Layout[];
		if (!Array.isArray(parsed)) return mergeOverviewLayout([], visibleIds);
		return mergeOverviewLayout(parsed, visibleIds);
	} catch {
		return mergeOverviewLayout([], visibleIds);
	}
}

export function saveOverviewLayout(layout: RGL.Layout[]) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
}
