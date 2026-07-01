/** Mail connector input — stable across Gmail / Apple Mail / Outlook. */
export interface MailDraftInput {
	to: string;
	subject: string;
	body: string;
	/** Raw email if known; otherwise connector resolves from name */
	toEmail?: string;
}

export type MailProvider = "auto" | "apple-mail" | "gmail-cli" | "gmail-web" | "outlook-web" | "file";

export type MailConnectorId = "apple-mail" | "gmail-cli" | "gmail-web" | "outlook-web" | "file";

export interface MailDraftResult {
	subject: string;
	to: string;
	provider: MailConnectorId;
	draftPath?: string;
	fallback?: boolean;
}

export interface MailOpenResult {
	provider: MailConnectorId;
	opened: boolean;
}

export interface MailCountUnreadResult {
	provider: MailConnectorId;
	count: number;
	/** CLI backend when provider is gmail-cli (gog | gws). */
	backend?: string;
}

export interface MailContextHint {
	activeApp?: string | null;
	activeWindow?: string | null;
	recentUrls?: Array<{ url: string; title?: string }>;
	/** User utterance — used to pick Gmail vs Apple Mail when provider is auto. */
	intent?: string;
}

export interface MailDraftOptions {
	provider?: MailProvider;
	context?: MailContextHint;
	onProgress?: (message: string) => void;
}

export type MailActionOptions = MailDraftOptions;
