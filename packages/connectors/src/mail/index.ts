import { countAppleMailUnread, createAppleMailDraft, openAppleMail } from "./apple-mail.js";
import { createFileDraft } from "./file-fallback.js";
import { countGmailCliUnread, probeGmailCli } from "./gmail-cli.js";
import {
	countGmailWebUnread,
	createGmailWebDraft,
	createOutlookWebDraft,
	openGmailWeb,
} from "./gmail-web.js";
import {
	countGmailUnreadViaNango,
	createGmailDraftViaNango,
	hasNangoGmailConnection,
} from "../nango/index.js";
import { connectorLabel, resolveMailConnector } from "./router.js";
import type {
	MailConnectorId,
	MailActionOptions,
	MailCountUnreadResult,
	MailContextHint,
	MailDraftInput,
	MailDraftOptions,
	MailDraftResult,
	MailOpenResult,
	MailProvider,
} from "./types.js";

function isGmailFamily(id: MailConnectorId): boolean {
	return id === "gmail-web" || id === "gmail-cli" || id === "gmail-nango";
}

/** True when gog/gws binary exists on PATH (may still need auth). */
export async function isGmailCliInstalled(): Promise<boolean> {
	const cli = await probeGmailCli();
	return Boolean(cli.backend);
}

/**
 * Gmail 选择顺序：CLI（已授权）→ Nango（已连接）→ CDP（gmail-web）。
 */
export async function resolveMailConnectorAsync(
	provider: MailProvider | undefined,
	context?: MailContextHint,
): Promise<MailConnectorId> {
	const configured = (provider ?? process.env.FOLD_MAIL_PROVIDER ?? "auto") as MailProvider;
	if (configured !== "auto") {
		return resolveMailConnector(provider, context);
	}

	const sync = resolveMailConnector(provider, context);
	if (isGmailFamily(sync)) {
		const cli = await probeGmailCli();
		if (cli.available) return "gmail-cli";
		if (await hasNangoGmailConnection()) return "gmail-nango";
		return "gmail-web";
	}
	return sync;
}

async function countGmailWithCliFirst(options: MailActionOptions): Promise<MailCountUnreadResult> {
	const cli = await probeGmailCli();
	if (cli.available) {
		options.onProgress?.(`Using Gmail CLI (${cli.backend})`);
		return countGmailCliUnread(cli);
	}
	// CLI 不可用 → Nango 托管授权 → 浏览器 CDP，逐级兜底
	if (await hasNangoGmailConnection()) {
		options.onProgress?.("Gmail CLI 不可用，改用 Nango 托管连接读取");
		return countGmailUnreadViaNango();
	}
	options.onProgress?.("Gmail CLI / Nango 均不可用，使用浏览器 CDP 兜底");
	try {
		return await countGmailWebUnread();
	} catch (webErr) {
		const webMsg = webErr instanceof Error ? webErr.message : String(webErr);
		throw new Error(
			`${cli.error ?? "Gmail CLI 不可用"}；Nango 未连接 Gmail；浏览器 CDP 兜底也失败: ${webMsg}`,
		);
	}
}

async function runConnector(
	id: MailConnectorId,
	input: MailDraftInput,
): Promise<MailDraftResult> {
	switch (id) {
		case "apple-mail":
			return createAppleMailDraft(input);
		case "gmail-nango":
			return createGmailDraftViaNango(input);
		case "gmail-cli":
		case "gmail-web":
			return createGmailWebDraft(input);
		case "outlook-web":
			return createOutlookWebDraft(input);
		case "file":
			return createFileDraft(input);
	}
}

/**
 * Create a mail draft via the best available connector.
 * Skill layer calls this — Planner never picks a provider.
 */
export async function createMailDraft(
	input: MailDraftInput,
	options: MailDraftOptions = {},
): Promise<MailDraftResult> {
	const connectorId = resolveMailConnector(options.provider, options.context);
	options.onProgress?.(`Creating ${connectorLabel(connectorId)} draft`);

	try {
		return await runConnector(connectorId, input);
	} catch (primaryErr) {
		if (isGmailFamily(connectorId) || connectorId === "outlook-web") {
			try {
				options.onProgress?.("Retrying with Apple Mail");
				return await createAppleMailDraft(input);
			} catch {
				options.onProgress?.("Saving draft file");
				const file = await createFileDraft(input);
				return { ...file, fallback: true };
			}
		}
		if (connectorId === "apple-mail") {
			options.onProgress?.("Saving draft file");
			return createFileDraft(input);
		}
		throw primaryErr;
	}
}

export async function openMail(options: MailActionOptions = {}): Promise<MailOpenResult> {
	const connectorId = await resolveMailConnectorAsync(options.provider, options.context);
	options.onProgress?.(`Opening ${connectorLabel(connectorId)}`);

	switch (connectorId) {
		case "gmail-cli": {
			const cli = await probeGmailCli();
			if (cli.available) {
				options.onProgress?.("Gmail CLI 已就绪，无需打开浏览器");
				return { provider: "gmail-cli", opened: false };
			}
			options.onProgress?.("Gmail CLI 未授权，改为打开 Gmail 网页");
			return openGmailWeb();
		}
		case "gmail-nango":
			options.onProgress?.("Nango 托管连接已就绪，无需打开浏览器");
			return { provider: "gmail-nango", opened: false };
		case "gmail-web":
			return openGmailWeb();
		case "apple-mail":
			return openAppleMail();
		default:
			throw new Error(`mail.open: unsupported provider ${connectorId}`);
	}
}

export async function countMailUnread(
	options: MailActionOptions = {},
): Promise<MailCountUnreadResult> {
	const connectorId = await resolveMailConnectorAsync(options.provider, options.context);
	options.onProgress?.(`Counting unread messages in ${connectorLabel(connectorId)}`);

	switch (connectorId) {
		case "gmail-cli":
			return countGmailWithCliFirst(options);
		case "gmail-nango":
			options.onProgress?.("使用 Nango 托管连接读取 Gmail");
			return countGmailUnreadViaNango();
		case "gmail-web":
			// 用户显式选了 gmail-web（CDP）时不再绕道 CLI
			options.onProgress?.("使用浏览器 CDP 读取 Gmail");
			return countGmailWebUnread();
		case "apple-mail":
			return countAppleMailUnread();
		default:
			throw new Error(`mail.countUnread: unsupported provider ${connectorId}`);
	}
}

export { formatCliVendorMaintenanceHint, GMAIL_CLI_VENDORS } from "./cli-vendors.js";
export { probeGmailCli, type GmailCliProbe } from "./gmail-cli.js";
export { openGogAuthInTerminal, openGwsAuthInTerminal } from "./auth-actions.js";
export {
	resolveMailConnector,
	detectMailConnector,
	connectorLabel,
} from "./router.js";
export type {
	MailDraftInput,
	MailDraftResult,
	MailDraftOptions,
	MailActionOptions,
	MailOpenResult,
	MailCountUnreadResult,
	MailContextHint,
	MailProvider,
	MailConnectorId,
} from "./types.js";
