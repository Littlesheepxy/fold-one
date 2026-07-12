import { app, Menu, Tray } from "electron";
import { listRecentEpisodes } from "@fold/memory";
import { PRODUCT_NAME } from "./brand.js";
import { createZhigengTrayImage } from "./tray-icon.js";

export function createTray(opts: {
	onOpenSettings: () => void;
	onQuit: () => void;
}): Tray {
	const tray = new Tray(createZhigengTrayImage());
	tray.setToolTip(PRODUCT_NAME);

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
			{ label: PRODUCT_NAME, enabled: false },
			{ type: "separator" },
			{ label: "最近任务", enabled: false },
			...episodeItems,
			{ type: "separator" },
			{
				label: "打开主页…",
				click: opts.onOpenSettings,
			},
			{
				label: `退出 ${PRODUCT_NAME}`,
				click: opts.onQuit,
			},
		]);
	};

	tray.setContextMenu(buildMenu());
	tray.on("click", () => tray.popUpContextMenu());

	const timer = setInterval(() => tray.setContextMenu(buildMenu()), 30_000);
	tray.on("mouse-enter", () => tray.setContextMenu(buildMenu()));

	app.on("will-quit", () => clearInterval(timer));

	return tray;
}
