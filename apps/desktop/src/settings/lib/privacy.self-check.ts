import assert from "node:assert/strict";
import { redactSensitiveUrl } from "./privacy.js";

const source =
	"chrome-extension://example/connect.html?mcpRelayUrl=ws%3A%2F%2Flocalhost&token=top-secret&client=fold#access_token=another-secret";
const redacted = redactSensitiveUrl(source);

assert.equal(redacted.includes("top-secret"), false);
assert.equal(redacted.includes("another-secret"), false);
assert.match(redacted, /token=\[已隐藏\]/);
assert.match(redacted, /access_token=\[已隐藏\]/);
assert.match(redacted, /mcpRelayUrl=ws%3A%2F%2Flocalhost/);
assert.equal(redactSensitiveUrl("https://example.com/docs?id=42"), "https://example.com/docs?id=42");

console.log("privacy self-check passed");
