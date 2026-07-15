const SENSITIVE_URL_PARAM =
	/(^|[?&#])((?:access_?token|refresh_?token|id_?token|token|api_?key|client_?secret|secret|password|passwd|signature|sig|authorization|auth)=)([^&#]*)/gi;

/**
 * Keeps a URL useful for recognition while preventing credentials from being
 * exposed in the UI, accessibility tree, screenshots, or hover text.
 */
export function redactSensitiveUrl(url: string): string {
	return url.replace(SENSITIVE_URL_PARAM, (_match, prefix: string, key: string) => {
		return `${prefix}${key}[已隐藏]`;
	});
}
