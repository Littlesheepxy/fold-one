import { writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { MailDraftInput, MailDraftResult } from "./types.js";

export async function createFileDraft(input: MailDraftInput): Promise<MailDraftResult> {
	const draftPath = join(homedir(), "Desktop", `fold-draft-${Date.now()}.txt`);
	await writeFile(
		draftPath,
		`To: ${input.to}\nSubject: ${input.subject}\n\n${input.body}`,
		"utf8",
	);
	return {
		subject: input.subject,
		to: input.to,
		provider: "file",
		draftPath,
		fallback: true,
	};
}
