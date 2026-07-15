import assert from "node:assert/strict";
import { shouldUseSmartVoice } from "./voice-setup.js";

assert.equal(shouldUseSmartVoice("auto", false, true), true);
assert.equal(shouldUseSmartVoice("auto", false, false), false);
assert.equal(shouldUseSmartVoice("auto", true, false), true);
assert.equal(shouldUseSmartVoice("local-whisper", true, true), false);

console.log("voice setup self-check passed");
