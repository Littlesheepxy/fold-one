export type HotkeyAction = "trigger" | "agent" | "cancel";

export interface TriggerPreset {
	id: string;
	label: string;
	keycode: number;
	trayShort: string;
	trayHold: string;
}

export interface AcceleratorPreset {
	id: string;
	label: string;
	keys: string[];
	accelerator: string;
	trayLabel: string;
}

export const DEFAULT_HOTKEY_IDS = {
	trigger: "right-meta",
	agent: "alt-space",
	cancel: "escape",
} as const;

export const TRIGGER_PRESETS: TriggerPreset[] = [
	{
		id: "right-meta",
		label: "右 ⌘",
		keycode: 3676,
		trayShort: "右⌘ 短按",
		trayHold: "右⌘ 按住",
	},
	{
		id: "right-alt",
		label: "右 ⌥",
		keycode: 3640,
		trayShort: "右⌥ 短按",
		trayHold: "右⌥ 按住",
	},
	{
		id: "f19",
		label: "F19",
		keycode: 102,
		trayShort: "F19 短按",
		trayHold: "F19 按住",
	},
];

export const AGENT_PRESETS: AcceleratorPreset[] = [
	{
		id: "alt-space",
		label: "⌥ Space",
		keys: ["⌥", "Space"],
		accelerator: "Alt+Space",
		trayLabel: "⌥ Space",
	},
	{
		id: "ctrl-space",
		label: "⌃ Space",
		keys: ["⌃", "Space"],
		accelerator: "Control+Space",
		trayLabel: "⌃ Space",
	},
	{
		id: "f18",
		label: "F18",
		keys: ["F18"],
		accelerator: "F18",
		trayLabel: "F18",
	},
];

export const CANCEL_PRESETS: AcceleratorPreset[] = [
	{
		id: "escape",
		label: "Esc",
		keys: ["Esc"],
		accelerator: "Escape",
		trayLabel: "Esc",
	},
	{
		id: "ctrl-escape",
		label: "⌃ Esc",
		keys: ["⌃", "Esc"],
		accelerator: "Control+Escape",
		trayLabel: "⌃ Esc",
	},
];

export interface HotkeyConfigIds {
	trigger?: string;
	agent?: string;
	cancel?: string;
}

export interface ResolvedHotkeyBindings {
	trigger: TriggerPreset;
	agent: AcceleratorPreset;
	cancel: AcceleratorPreset;
}

export function resolveHotkeyBindings(
	ids: HotkeyConfigIds = {},
): ResolvedHotkeyBindings {
	return {
		trigger:
			TRIGGER_PRESETS.find((p) => p.id === ids.trigger) ??
			TRIGGER_PRESETS.find((p) => p.id === DEFAULT_HOTKEY_IDS.trigger)!,
		agent:
			AGENT_PRESETS.find((p) => p.id === ids.agent) ??
			AGENT_PRESETS.find((p) => p.id === DEFAULT_HOTKEY_IDS.agent)!,
		cancel:
			CANCEL_PRESETS.find((p) => p.id === ids.cancel) ??
			CANCEL_PRESETS.find((p) => p.id === DEFAULT_HOTKEY_IDS.cancel)!,
	};
}

export function hotkeyConfigFromBindings(
	bindings: ResolvedHotkeyBindings,
): Required<HotkeyConfigIds> {
	return {
		trigger: bindings.trigger.id,
		agent: bindings.agent.id,
		cancel: bindings.cancel.id,
	};
}

/** App-internal mutex before touching globalShortcut. */
export function findHotkeyBindingConflict(
	bindings: ResolvedHotkeyBindings,
	opts?: { accessibilityGranted?: boolean },
): HotkeyAction | "duplicate-accelerator" | null {
	if (bindings.agent.accelerator === bindings.cancel.accelerator) {
		return "duplicate-accelerator";
	}
	if (bindings.agent.accelerator === "F19" && bindings.trigger.id === "f19") {
		return "agent";
	}
	if (
		bindings.agent.id === "f18" &&
		opts?.accessibilityGranted === false
	) {
		return "agent";
	}
	return null;
}

export function presetOptionsForRenderer() {
	return {
		trigger: TRIGGER_PRESETS.map((p) => ({ id: p.id, label: p.label })),
		agent: AGENT_PRESETS.map((p) => ({ id: p.id, label: p.label, keys: p.keys })),
		cancel: CANCEL_PRESETS.map((p) => ({ id: p.id, label: p.label, keys: p.keys })),
	};
}
