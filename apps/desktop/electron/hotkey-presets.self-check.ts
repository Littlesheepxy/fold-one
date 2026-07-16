import assert from "node:assert/strict";
import {
	AGENT_PRESETS,
	CANCEL_PRESETS,
	DEFAULT_HOTKEY_IDS,
	findHotkeyBindingConflict,
	resolveHotkeyBindings,
	TRIGGER_PRESETS,
} from "./hotkey-presets.js";

const defaults = resolveHotkeyBindings();
assert.equal(defaults.trigger.id, DEFAULT_HOTKEY_IDS.trigger);
assert.equal(defaults.agent.id, DEFAULT_HOTKEY_IDS.agent);
assert.equal(defaults.cancel.id, DEFAULT_HOTKEY_IDS.cancel);
assert.equal(findHotkeyBindingConflict(defaults), null);

const dupAccel = resolveHotkeyBindings({ cancel: "escape", agent: "alt-space" });
assert.equal(findHotkeyBindingConflict(dupAccel), null);

const f19Conflict = resolveHotkeyBindings({ trigger: "f19", agent: "f18" });
assert.equal(findHotkeyBindingConflict(f19Conflict), null);

assert.equal(TRIGGER_PRESETS.length, 3);
assert.equal(AGENT_PRESETS.length, 3);
assert.equal(CANCEL_PRESETS.length, 2);

console.log("[hotkey-presets.self-check] ok");
