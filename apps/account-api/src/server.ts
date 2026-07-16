/**
 * 知更账户 API — 独立于 Fold Hub。
 * 默认 :3010。mock 模式验证码固定 888888。
 */
import { createServer } from "node:http";
import { Hono } from "hono";
import { cors } from "hono/cors";
import {
	deleteUser,
	requestLoginCode,
	resolveUserFromBearer,
	revokeBearer,
	updateUserName,
	verifyLoginCode,
} from "./auth.js";
import type { BillingFeature } from "./cost-catalog.js";
import {
	cnProductMeta,
	isCnProductId,
	resolveCnProductIds,
} from "./products.js";
import {
	activateSubscription,
	cancelUserSubscriptions,
	listUserPurchases,
} from "./payments.js";
import { createStripeCheckoutSession, handleStripeWebhook, stripeLiveEnabled } from "./stripe.js";
import { consumeUsage, getEntitlements, recordCost } from "./usage-ledger.js";

const PORT = Number(process.env.ACCOUNT_API_PORT ?? 3010);

const app = new Hono();
app.use("*", cors({ origin: "*", allowHeaders: ["Content-Type", "Authorization"] }));

app.get("/health", (c) =>
	c.json({
		ok: true,
		service: "account-api",
		authMode: process.env.ACCOUNT_AUTH_MODE ?? "auto",
	}),
);

function requireUser(c: { req: { header: (name: string) => string | undefined } }) {
	return resolveUserFromBearer(c.req.header("Authorization"));
}

app.post("/auth/request-code", async (c) => {
	const body = await c.req.json<{ email?: string }>().catch(() => ({} as { email?: string }));
	if (!body.email) return c.json({ error: "email_required" }, 400);
	try {
		const result = await requestLoginCode(body.email);
		return c.json({ ok: true, ...result });
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : "failed" }, 400);
	}
});

app.post("/auth/verify", async (c) => {
	const body = await c.req
		.json<{ email?: string; code?: string }>()
		.catch(() => ({} as { email?: string; code?: string }));
	if (!body.email || !body.code) return c.json({ error: "email_and_code_required" }, 400);
	try {
		const { user, apiKey } = verifyLoginCode({ email: body.email, code: body.code });
		return c.json({
			ok: true,
			apiKey,
			user: { id: user.id, email: user.email, name: user.name, image: user.image },
		});
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : "failed" }, 400);
	}
});

app.post("/auth/logout", (c) => {
	revokeBearer(c.req.header("Authorization"));
	return c.json({ ok: true });
});

app.get("/me", (c) => {
	const user = requireUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 401);
	return c.json({
		id: user.id,
		email: user.email,
		name: user.name,
		image: user.image,
		entitlements: getEntitlements(user.id),
	});
});

app.patch("/me", async (c) => {
	const user = requireUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 401);
	const body = await c.req.json<{ name?: string }>().catch(() => ({} as { name?: string }));
	if (!body.name) return c.json({ error: "name_required" }, 400);
	try {
		const updated = updateUserName(user.id, body.name);
		return c.json({ id: updated.id, email: updated.email, name: updated.name });
	} catch (error) {
		return c.json({ error: error instanceof Error ? error.message : "failed" }, 400);
	}
});

app.delete("/me", (c) => {
	const user = requireUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 401);
	revokeBearer(c.req.header("Authorization"));
	deleteUser(user.id);
	return c.json({ ok: true });
});

app.get("/billing/entitlements", (c) => {
	const user = requireUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 401);
	return c.json(getEntitlements(user.id));
});

app.get("/billing/purchases", (c) => {
	const user = requireUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 401);
	return c.json({ purchases: listUserPurchases(user.id) });
});

app.post("/billing/voice-usage", async (c) => {
	const user = requireUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 401);
	const body = await c.req.json<{
		requestId?: string;
		audioSeconds?: number;
		mode?: string;
		model?: string;
	}>();
	if (!body.requestId || typeof body.audioSeconds !== "number") {
		return c.json({ error: "invalid_body" }, 400);
	}
	const consumed = consumeUsage({
		userId: user.id,
		voiceSeconds: body.audioSeconds,
		smartActions: body.mode === "reply" || body.mode === "agent" ? 1 : 0,
	});
	if (!consumed.ok) return c.json({ ok: false, reason: consumed.reason }, 403);
	const recorded = recordCost({
		requestId: body.requestId,
		userId: user.id,
		feature: body.mode === "reply" ? "voice_reply" : "voice_structure",
		provider: "dashscope",
		model: body.model ?? "qwen3.5-omni-flash-realtime",
		usage: { audioSeconds: body.audioSeconds },
	});
	return c.json({ ok: true, ...recorded, entitlements: getEntitlements(user.id) });
});

app.post("/billing/llm-usage", async (c) => {
	const user = requireUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 401);
	const body = await c.req.json<{
		requestId?: string;
		feature?: BillingFeature;
		provider?: string;
		model?: string;
		funding?: "company" | "byok";
		operationId?: string;
		smartActions?: number;
		usage?: Record<string, number>;
	}>();
	if (!body.requestId || !body.feature || !body.provider || !body.model) {
		return c.json({ error: "invalid_body" }, 400);
	}
	const smartActions =
		body.smartActions ??
		(body.feature === "planner" || body.feature === "repair" || body.feature === "noticed"
			? 1
			: 0);
	if (smartActions > 0) {
		const consumed = consumeUsage({ userId: user.id, smartActions });
		if (!consumed.ok) return c.json({ ok: false, reason: consumed.reason }, 403);
	}
	const recorded = recordCost({
		requestId: body.requestId,
		operationId: body.operationId,
		userId: user.id,
		feature: body.feature,
		provider: body.provider,
		model: body.model,
		funding: body.funding,
		usage: body.usage ?? {},
	});
	return c.json({
		ok: true,
		created: recorded.created,
		companyCostMicros: recorded.companyCostMicros,
	});
});

app.post("/billing/checkout", async (c) => {
	const user = requireUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 401);
	const body = await c.req.json<{ productId?: string }>();
	if (!body.productId || !isCnProductId(body.productId)) {
		return c.json({ error: "invalid_product" }, 400);
	}
	const meta = cnProductMeta(body.productId);
	const live = stripeLiveEnabled();

	if (!live) {
		activateSubscription({
			subscriptionId: `mock_stripe_${user.id}_${body.productId}`,
			customerId: `mock_stripe_${user.id}`,
			productId: body.productId,
			userId: user.id,
			provider: "mock",
			status: "active",
		});
		return c.json({
			ok: true,
			mode: "mock",
			activated: true,
			productId: body.productId,
			interval: meta.interval,
			amountYuan: meta.amountYuan,
			anchorYuan: meta.anchorYuan,
			entitlements: getEntitlements(user.id),
		});
	}

	try {
		const session = await createStripeCheckoutSession({
			userId: user.id,
			email: user.email,
			productId: body.productId,
		});
		return c.json({
			ok: true,
			mode: "live",
			checkoutUrl: session.checkoutUrl,
			sessionId: session.sessionId,
			productId: body.productId,
		});
	} catch (error) {
		return c.json(
			{ error: error instanceof Error ? error.message : "stripe_checkout_failed" },
			500,
		);
	}
});

app.post("/billing/cancel", (c) => {
	const user = requireUser(c);
	if (!user) return c.json({ error: "unauthorized" }, 401);
	cancelUserSubscriptions(user.id);
	return c.json({ ok: true, entitlements: getEntitlements(user.id) });
});

app.get("/billing/products", (c) => {
	const ids = resolveCnProductIds();
	return c.json({
		products: [
			{ productId: ids.monthly, ...cnProductMeta(ids.monthly) },
			{ productId: ids.yearly, ...cnProductMeta(ids.yearly) },
		],
	});
});

app.get("/billing/success", (c) =>
	c.html(
		"<!doctype html><html><body style='font-family:system-ui;padding:40px'><h1>支付成功</h1><p>请回到知更，点击「同步权益」。</p></body></html>",
	),
);
app.get("/billing/cancel-page", (c) =>
	c.html(
		"<!doctype html><html><body style='font-family:system-ui;padding:40px'><h1>已取消</h1><p>可回到知更重新开通。</p></body></html>",
	),
);

const server = createServer(async (req, res) => {
	try {
		const host = req.headers.host ?? `localhost:${PORT}`;
		const url = `http://${host}${req.url ?? "/"}`;
		const headers = new Headers();
		for (const [key, value] of Object.entries(req.headers)) {
			if (value == null) continue;
			if (Array.isArray(value)) value.forEach((v) => headers.append(key, v));
			else headers.set(key, value);
		}
		const method = req.method ?? "GET";
		const hasBody = method !== "GET" && method !== "HEAD";
		const chunks: Buffer[] = [];
		if (hasBody) {
			for await (const chunk of req) chunks.push(Buffer.from(chunk));
		}
		const rawBody = hasBody && chunks.length ? Buffer.concat(chunks) : Buffer.alloc(0);

		// Stripe webhook needs raw body for signature verification
		if (method === "POST" && (req.url ?? "").startsWith("/webhooks/stripe")) {
			const result = await handleStripeWebhook(
				rawBody,
				typeof req.headers["stripe-signature"] === "string"
					? req.headers["stripe-signature"]
					: undefined,
			);
			res.statusCode = result.ok ? 200 : 400;
			res.setHeader("Content-Type", "application/json");
			res.end(JSON.stringify(result.ok ? { received: true } : { error: result.error }));
			return;
		}

		const request = new Request(url, {
			method,
			headers,
			body: hasBody && rawBody.length ? rawBody : undefined,
		});
		const response = await app.fetch(request);
		res.statusCode = response.status;
		response.headers.forEach((value, key) => {
			res.setHeader(key, value);
		});
		const buf = Buffer.from(await response.arrayBuffer());
		res.end(buf);
	} catch (error) {
		console.error("[account-api] request failed", error);
		res.statusCode = 500;
		res.end(JSON.stringify({ error: "internal" }));
	}
});

server.listen(PORT, () => {
	console.log(`[account-api] listening on :${PORT}`);
});
