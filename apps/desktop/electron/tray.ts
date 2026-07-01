import { app, Menu, nativeImage, Tray } from "electron";
import { listRecentEpisodes } from "@fold/memory";

export function createTray(opts: {
	onOpenSettings: () => void;
	onQuit: () => void;
}): Tray {
	const icon = nativeImage.createFromDataURL(
		"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAMElEQVQ4T2NkYGD4z0ABYBzVMKoBBg0GBgZGBjQ+M4wG0Q2jGqY0jGoY1TCqYVLDqIZJDQMA3F0B3bGJ6E8AAAAASUVORK5CYII=",
	);
	const tray = new Tray(icon.resize({ width: 16, height: 16 }));
	tray.setToolTip("Fold Runtime");

	const buildMenu = () => {
		let episodeItems: Electron.MenuItemConstructorOptions[] = [{ label: "暂无记录", enabled: false }];
		try {
			const episodes = listRecentEpisodes(5);
			if (episodes.length > 0) {
				episodeItems = episodes.map((ep) => ({
					label: `${ep.intent.slice(0, 40)}${ep.intent.length > 40 ? "…" : ""}`,
					enabled: false,
				}));
			}
		} catch {
			episodeItems = [{ label: "记录暂不可用", enabled: false }];
		}

		return Menu.buildFromTemplate([
			{ label: "Fold Runtime", enabled: false },
			{ type: "separator" },
			{ label: "Recent", enabled: false },
			...episodeItems,
			{ type: "separator" },
			{
				label: "主页…",
				click: opts.onOpenSettings,
			},
			{
				label: "Settings…",
				click: opts.onOpenSettings,
			},
			{
				label: "Quit Fold",
				click: opts.onQuit,
			},
		]);
	};

	tray.setContextMenu(buildMenu());
	tray.on("click", () => tray.popUpContextMenu());

	// Refresh episodes every 30s
	const timer = setInterval(() => tray.setContextMenu(buildMenu()), 30_000);
	tray.on("mouse-enter", () => tray.setContextMenu(buildMenu()));

	app.on("will-quit", () => clearInterval(timer));

	return tray;
}
