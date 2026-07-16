export interface UndoReceipt {
	targetApp: string | null;
	createdAt: number;
}

export const UNDO_WINDOW_MS = 30_000;

export function createUndoReceipt(targetApp: string | null, now = Date.now()): UndoReceipt {
	return { targetApp: targetApp?.trim() || null, createdAt: now };
}

export function canUseUndoReceipt(
	receipt: UndoReceipt | null,
	now = Date.now(),
	windowMs = UNDO_WINDOW_MS,
): boolean {
	return Boolean(receipt && now >= receipt.createdAt && now - receipt.createdAt <= windowMs);
}
