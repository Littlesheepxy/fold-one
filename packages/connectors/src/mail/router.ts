import type { MailContextHint, MailConnectorId, MailProvider } from "./types.js";

const GMAIL_RE = /mail\.google\.com/i;
const OUTLOOK_RE = /outlook\.(live|office)\.com|outlook\.office365\.com/i;
const GMAIL_INTENT_RE = /gmail|谷歌邮箱|google\s*mail/i;
const OUTLOOK_INTENT_RE = /outlook|微软邮箱/i;
const APPLE_MAIL_INTENT_RE = /apple\s*mail|苹果邮件|本地邮件/i;

function intentMailConnector(intent?: string): MailConnectorId | null {
	if (!intent?.trim()) return null;
	if (GMAIL_INTENT_RE.test(intent)) return "gmail-cli";
	if (OUTLOOK_INTENT_RE.test(intent)) return "outlook-web";
	if (APPLE_MAIL_INTENT_RE.test(intent)) return "apple-mail";
	return null;
}

export function detectMailConnector(context?: MailContextHint): MailConnectorId | null {
	if (!context) return null;

	for (const u of context.recentUrls ?? []) {
		if (GMAIL_RE.test(u.url)) return "gmail-web";
		if (OUTLOOK_RE.test(u.url)) return "outlook-web";
	}

	const windowHint = `${context.activeWindow ?? ""} ${context.activeApp ?? ""}`;
	if (GMAIL_RE.test(windowHint) || /gmail/i.test(windowHint)) return "gmail-web";
	if (OUTLOOK_RE.test(windowHint) || /outlook/i.test(windowHint)) return "outlook-web";
	if (/^mail$/i.test(context.activeApp ?? "")) return "apple-mail";

	return null;
}

export function resolveMailConnector(
	provider: MailProvider | undefined,
	context?: MailContextHint,
): MailConnectorId {
	const configured = (provider ?? process.env.FOLD_MAIL_PROVIDER ?? "auto") as MailProvider;

	if (configured === "apple-mail") return "apple-mail";
	if (configured === "gmail-cli") return "gmail-cli";
	if (configured === "gmail-nango") return "gmail-nango";
	if (configured === "gmail-web") return "gmail-web";
	if (configured === "outlook-web") return "outlook-web";
	if (configured === "file") return "file";

	const fromIntent = intentMailConnector(context?.intent);
	if (fromIntent) return fromIntent;

	const detected = detectMailConnector(context);
	if (detected) return detected;

	// auto default: prefer native Mail on macOS, else file fallback path
	if (process.platform === "darwin") return "apple-mail";
	return "file";
}

export function connectorLabel(id: MailConnectorId): string {
	switch (id) {
		case "gmail-cli":
			return "Gmail (CLI)";
		case "gmail-nango":
			return "Gmail (Nango)";
		case "gmail-web":
			return "Gmail";
		case "outlook-web":
			return "Outlook";
		case "apple-mail":
			return "Mail";
		case "file":
			return "Draft file";
	}
}
