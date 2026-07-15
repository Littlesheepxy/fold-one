import { db, newId, nowIso } from "./db.js";
import type { PaymentProvider } from "./products.js";

export function activateSubscription(input: {
	subscriptionId: string;
	customerId: string;
	productId: string;
	userId: string;
	provider?: PaymentProvider;
	status?: "active" | "trialing";
}): { created: boolean } {
	const status = input.status ?? "active";
	const existing = db
		.prepare("SELECT id FROM purchase WHERE subscriptionId = ?")
		.get(input.subscriptionId) as { id: string } | undefined;
	const ts = nowIso();
	if (existing) {
		db.prepare(
			`UPDATE purchase SET status = ?, productId = ?, updatedAt = ? WHERE id = ?`,
		).run(status, input.productId, ts, existing.id);
		return { created: false };
	}
	db.prepare(
		`INSERT INTO purchase
       (id, userId, type, customerId, subscriptionId, productId, status, createdAt, updatedAt)
     VALUES (?, ?, 'SUBSCRIPTION', ?, ?, ?, ?, ?, ?)`,
	).run(
		newId(),
		input.userId,
		input.customerId,
		input.subscriptionId,
		input.productId,
		status,
		ts,
		ts,
	);
	return { created: true };
}

export function cancelSubscription(subscriptionId: string): void {
	db.prepare("DELETE FROM purchase WHERE subscriptionId = ?").run(subscriptionId);
}

export function cancelUserSubscriptions(userId: string): void {
	db.prepare("DELETE FROM purchase WHERE userId = ?").run(userId);
}

export function listUserPurchases(userId: string) {
	return db
		.prepare(
			`SELECT id, type, customerId, subscriptionId, productId, status, createdAt, updatedAt
       FROM purchase WHERE userId = ? ORDER BY updatedAt DESC`,
		)
		.all(userId);
}
