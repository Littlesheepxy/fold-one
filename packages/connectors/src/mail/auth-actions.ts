import { openInTerminal } from "../terminal.js";

/** Open Terminal and run gog auth add (macOS). */
export function openGogAuthInTerminal(accountHint?: string): void {
	const cmd = accountHint?.includes("@") ? `gog auth add ${accountHint}` : "gog auth add";
	openInTerminal(cmd);
}

export function openGwsAuthInTerminal(): void {
	openInTerminal("gws auth setup");
}
