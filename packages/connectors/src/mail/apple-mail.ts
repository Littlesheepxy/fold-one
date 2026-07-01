import { runAppleScript } from "../shell.js";
import type {
	MailCountUnreadResult,
	MailDraftInput,
	MailDraftResult,
	MailOpenResult,
} from "./types.js";

function escapeAppleScript(s: string): string {
	return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function resolveToEmail(input: MailDraftInput): string {
	if (input.toEmail) return input.toEmail;
	if (input.to.includes("@")) return input.to;
	return `${input.to}@example.com`;
}

export async function createAppleMailDraft(input: MailDraftInput): Promise<MailDraftResult> {
	const toEmail = resolveToEmail(input);
	const escapedBody = escapeAppleScript(input.body);
	const escapedSubject = escapeAppleScript(input.subject);
	const escapedName = escapeAppleScript(input.to);
	const escapedEmail = escapeAppleScript(toEmail);

	const script = `
tell application "Mail"
  set newMessage to make new outgoing message with properties {subject:"${escapedSubject}", content:"${escapedBody}", visible:true}
  tell newMessage
    make new to recipient at end of to recipients with properties {address:"${escapedEmail}", name:"${escapedName}"}
  end tell
  activate
end tell
`;

	await runAppleScript(script);
	return { subject: input.subject, to: input.to, provider: "apple-mail" };
}

export async function openAppleMail(): Promise<MailOpenResult> {
	await runAppleScript(`
tell application "Mail"
  activate
end tell
`);
	return { provider: "apple-mail", opened: true };
}

export async function countAppleMailUnread(): Promise<MailCountUnreadResult> {
	const output = await runAppleScript(`
tell application "Mail"
  set unreadMessages to messages of inbox whose read status is false
  return count of unreadMessages
end tell
`);
	const count = Number.parseInt(output.trim(), 10);
	if (!Number.isFinite(count)) {
		throw new Error(`Mail unread count parse failed: ${output.trim()}`);
	}
	return { provider: "apple-mail", count };
}
