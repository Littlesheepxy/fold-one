import { activateSubscription, cancelSubscription } from "./payments.js";
import { isCnProductId, stripePriceIdForProduct } from "./products.js";

function stripeSecret(): string | null {
	return process.env.STRIPE_SECRET_KEY?.trim() || null;
}

export function stripeLiveEnabled(): boolean {
	return Boolean(stripeSecret() && process.env.STRIPE_PRICE_PRO_MONTHLY?.trim());
}

export async function createStripeCheckoutSession(input: {
	userId: string;
	email: string;
	productId: string;
}): Promise<{ checkoutUrl: string; sessionId: string }> {
	const secret = stripeSecret();
	if (!secret) throw new Error("stripe_not_configured");
	const priceId = stripePriceIdForProduct(input.productId);
	if (!priceId) throw new Error("stripe_price_missing");

	const Stripe = (await import("stripe")).default;
	const stripe = new Stripe(secret);
	const publicUrl = (process.env.ACCOUNT_PUBLIC_URL ?? "http://localhost:3010").replace(/\/$/, "");

	const session = await stripe.checkout.sessions.create({
		mode: "subscription",
		customer_email: input.email,
		line_items: [{ price: priceId, quantity: 1 }],
		success_url: `${publicUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${publicUrl}/billing/cancel-page`,
		client_reference_id: input.userId,
		metadata: {
			userId: input.userId,
			productId: input.productId,
		},
		subscription_data: {
			metadata: {
				userId: input.userId,
				productId: input.productId,
			},
		},
	});

	if (!session.url) throw new Error("stripe_session_url_missing");
	return { checkoutUrl: session.url, sessionId: session.id };
}

export async function handleStripeWebhook(
	rawBody: Buffer,
	signature: string | undefined,
): Promise<{ ok: true } | { ok: false; error: string }> {
	const secret = stripeSecret();
	const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
	if (!secret || !webhookSecret) return { ok: false, error: "stripe_webhook_not_configured" };
	if (!signature) return { ok: false, error: "missing_signature" };

	const Stripe = (await import("stripe")).default;
	const stripe = new Stripe(secret);
	let event: Awaited<ReturnType<typeof stripe.webhooks.constructEvent>>;
	try {
		event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
	} catch {
		return { ok: false, error: "invalid_signature" };
	}

	if (event.type === "checkout.session.completed") {
		const session = event.data.object as {
			id: string;
			client_reference_id?: string | null;
			customer?: string | { id: string } | null;
			subscription?: string | { id: string } | null;
			metadata?: { userId?: string; productId?: string };
		};
		const userId = session.metadata?.userId ?? session.client_reference_id ?? "";
		const productId = session.metadata?.productId ?? "";
		const subscriptionId =
			typeof session.subscription === "string"
				? session.subscription
				: session.subscription?.id;
		const customerId =
			typeof session.customer === "string" ? session.customer : session.customer?.id;
		if (userId && productId && subscriptionId && isCnProductId(productId)) {
			activateSubscription({
				subscriptionId,
				customerId: customerId ?? `stripe_${userId}`,
				productId,
				userId,
				provider: "stripe",
				status: "active",
			});
		}
	}

	if (event.type === "customer.subscription.deleted") {
		const sub = event.data.object as { id: string };
		if (sub.id) cancelSubscription(sub.id);
	}

	return { ok: true };
}
