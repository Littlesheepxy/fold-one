import type { ClipboardHistoryItem } from "../settings/types.js";

export interface ClipboardRecoveryOffer {
	previous: ClipboardHistoryItem;
	current: ClipboardHistoryItem;
}

/** 刚换复制且存在上一条时，提示用户可找回。 */
export function offerClipboardRecovery(
	history: ClipboardHistoryItem[],
): ClipboardRecoveryOffer | null {
	if (history.length < 2) return null;
	const current = history[0]!;
	const previous = history[1]!;
	if (current.text === previous.text) return null;
	return { previous, current };
}
