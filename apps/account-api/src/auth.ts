import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { db, findUserById, newId, nowIso, upsertUserByEmail, type UserRow } from "./db.js";

const MOCK_CODE = "888888";

function sha256(value: string): string {
	return createHash("sha256").update(value).digest("hex");
}

function hashEquals(a: string, b: string): boolean {
	const ba = Buffer.from(a);
	const bb = Buffer.from(b);
	if (ba.length !== bb.length) return false;
	return timingSafeEqual(ba, bb);
}

export function authMode(): "live" | "mock" {
	if (process.env.ACCOUNT_AUTH_MODE === "live") return "live";
	if (process.env.ACCOUNT_AUTH_MODE === "mock") return "mock";
	return process.env.SMTP_URL?.trim() ? "live" : "mock";
}

export async function requestLoginCode(email: string): Promise<{ mode: "live" | "mock"; expiresIn: number }> {
	const normalized = email.trim().toLowerCase();
	if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) {
		throw new Error("invalid_email");
	}
	const mode = authMode();
	const code = mode === "mock" ? MOCK_CODE : String(Math.floor(100000 + Math.random() * 900000));
	const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();
	db.prepare(
		`INSERT INTO auth_code (id, email, codeHash, expiresAt, consumedAt, createdAt)
     VALUES (?, ?, ?, ?, NULL, ?)`,
	).run(newId(), normalized, sha256(code), expiresAt, nowIso());

	if (mode === "mock") {
		console.log(`[account-api] mock login code for ${normalized}: ${code}`);
	} else {
		// ponytail: SMTP wiring deferred; live mode currently logs until SMTP_URL sender lands.
		console.log(`[account-api] login code for ${normalized}: ${code} (configure SMTP to send email)`);
	}
	return { mode, expiresIn: 600 };
}

export function verifyLoginCode(input: {
	email: string;
	code: string;
}): { user: UserRow; apiKey: string } {
	const normalized = input.email.trim().toLowerCase();
	const code = input.code.trim();
	const row = db
		.prepare(
			`SELECT * FROM auth_code
       WHERE email = ? AND consumedAt IS NULL
       ORDER BY createdAt DESC LIMIT 1`,
		)
		.get(normalized) as
		| { id: string; codeHash: string; expiresAt: string }
		| undefined;

	if (!row) throw new Error("code_not_found");
	if (new Date(row.expiresAt).getTime() < Date.now()) throw new Error("code_expired");
	if (!hashEquals(row.codeHash, sha256(code))) throw new Error("code_invalid");

	db.prepare("UPDATE auth_code SET consumedAt = ? WHERE id = ?").run(nowIso(), row.id);
	const user = upsertUserByEmail(normalized);
	const raw = `zk_${randomBytes(24).toString("base64url")}`;
	db.prepare(
		`INSERT INTO api_token (id, userId, tokenHash, prefix, name, createdAt, lastUsedAt, revokedAt)
     VALUES (?, ?, ?, 'zk_', 'desktop', ?, NULL, NULL)`,
	).run(newId(), user.id, sha256(raw), nowIso());
	return { user, apiKey: raw };
}

export function resolveUserFromBearer(authHeader: string | undefined): UserRow | null {
	if (!authHeader?.startsWith("Bearer ")) return null;
	const token = authHeader.slice(7).trim();
	if (!token.startsWith("zk_")) return null;
	const row = db
		.prepare(
			`SELECT userId FROM api_token WHERE tokenHash = ? AND revokedAt IS NULL`,
		)
		.get(sha256(token)) as { userId: string } | undefined;
	if (!row) return null;
	db.prepare("UPDATE api_token SET lastUsedAt = ? WHERE tokenHash = ?").run(nowIso(), sha256(token));
	return findUserById(row.userId) ?? null;
}

export function revokeBearer(authHeader: string | undefined): void {
	if (!authHeader?.startsWith("Bearer ")) return;
	const token = authHeader.slice(7).trim();
	db.prepare("UPDATE api_token SET revokedAt = ? WHERE tokenHash = ?").run(
		nowIso(),
		sha256(token),
	);
}

export function updateUserName(userId: string, name: string): UserRow {
	const trimmed = name.trim().slice(0, 64);
	if (!trimmed) throw new Error("invalid_name");
	db.prepare("UPDATE user SET name = ?, updatedAt = ? WHERE id = ?").run(
		trimmed,
		nowIso(),
		userId,
	);
	return findUserById(userId)!;
}

export function deleteUser(userId: string): void {
	db.prepare("DELETE FROM user WHERE id = ?").run(userId);
}
