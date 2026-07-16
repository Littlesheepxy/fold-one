// synced-from: Fold/packages/payments/provider/cn/products.ts
export const CN_PRODUCT_IDS = {
	monthly: "pro_monthly_cny",
	yearly: "pro_yearly_cny",
} as const;

export type PaymentProvider = "stripe" | "mock";

export function resolveCnProductIds(): { monthly: string; yearly: string } {
	return {
		monthly: process.env.PRICE_ID_PRO_MONTHLY_CNY?.trim() || CN_PRODUCT_IDS.monthly,
		yearly: process.env.PRICE_ID_PRO_YEARLY_CNY?.trim() || CN_PRODUCT_IDS.yearly,
	};
}

export function isCnProductId(productId: string): boolean {
	const ids = resolveCnProductIds();
	return (
		productId === ids.monthly ||
		productId === ids.yearly ||
		productId === CN_PRODUCT_IDS.monthly ||
		productId === CN_PRODUCT_IDS.yearly
	);
}

export function cnProductMeta(productId: string): {
	interval: "month" | "year";
	amountYuan: number;
	anchorYuan: number;
	label: string;
} {
	const ids = resolveCnProductIds();
	if (productId === ids.yearly || productId === CN_PRODUCT_IDS.yearly) {
		return {
			interval: "year",
			amountYuan: 228,
			anchorYuan: 358.8,
			label: "知更 Pro 年付",
		};
	}
	return {
		interval: "month",
		amountYuan: 29.9,
		anchorYuan: 45.9,
		label: "知更 Pro 月付",
	};
}

export function stripePriceIdForProduct(productId: string): string | null {
	const ids = resolveCnProductIds();
	if (productId === ids.yearly || productId === CN_PRODUCT_IDS.yearly) {
		return process.env.STRIPE_PRICE_PRO_YEARLY?.trim() || null;
	}
	if (productId === ids.monthly || productId === CN_PRODUCT_IDS.monthly) {
		return process.env.STRIPE_PRICE_PRO_MONTHLY?.trim() || null;
	}
	return null;
}

export function allProProductIds(): string[] {
	const cn = resolveCnProductIds();
	return [cn.monthly, cn.yearly, CN_PRODUCT_IDS.monthly, CN_PRODUCT_IDS.yearly];
}
