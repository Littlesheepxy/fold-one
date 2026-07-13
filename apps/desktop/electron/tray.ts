import { app, Menu, Tray } from "electron";
import { PRODUCT_NAME } from "./brand.js";
import { createZhigengTrayImage } from "./tray-icon.js";

export interface TraySessionState {
	recording: boolean;
	predicting: boolean;
}

export function createTray(opts: {
	onVoiceStructure: () => void;
	onReplyPredict: () => void;
	onVoiceAgent: () => void;
	onCancel: () => void;
	onOpenSettings: () => void;
	onQuit: () => void;
	getSessionState: () => TraySessionState;
}): Tray {
	const tray = new Tray(createZhigengTrayImage());
	tray.setToolTip(PRODUCT_NAME);

	const shortcut = (label: string, keys: string) =>
		process.platform === "darwin" ? `${label}\t${keys}` : label;

	const buildMenu = () => {
		const { recording, predicting } = opts.getSessionState();
		const busy = recording || predicting;

		const items: Electron.MenuItemConstructorOptions[] = [
			{ label: PRODUCT_NAME, enabled: false },
			{ type: "separator" },
			{
				label: shortcut("语音转写", "右⌘ 短按"),
				click: opts.onVoiceStructure,
			},
			{
				label: shortcut("智能代回", "右⌘ 按住"),
				click: opts.onReplyPredict,
			},
			{
				label: shortcut("Agent 任务", "⌥ Space"),
				click: opts.onVoiceAgent,
			},
		];

		if (busy) {
			items.push({
				label: shortcut("取消当前", "Esc"),
				click: opts.onCancel,
			});
		}

		items.push(
			{ type: "separator" },
			{
				label: "打开主页…",
				click: opts.onOpenSettings,
			},
			{
				label: `退出 ${PRODUCT_NAME}`,
				click: opts.onQuit,
			},
		);

		return Menu.buildFromTemplate(items);
	};

	const popupMenu = (bounds?: Electron.Rectangle) => {
		const menu = buildMenu();
		if (bounds && process.platform === "darwin") {
			tray.popUpContextMenu(menu, { x: bounds.x, y: bounds.y + bounds.height });
			return;
		}
		tray.popUpContextMenu(menu);
	};

	tray.setContextMenu(buildMenu());
	tray.on("click", (_event, bounds) => popupMenu(bounds));
	tray.on("right-click", (_event, bounds) => popupMenu(bounds));

	const timer = setInterval(() => tray.setContextMenu(buildMenu()), 5_000);
	tray.on("mouse-enter", () => tray.setContextMenu(buildMenu()));

	app.on("will-quit", () => clearInterval(timer));

	return tray;
}
