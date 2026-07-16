const HUB_URL = (process.env.FOLD_HUB_URL ?? "https://foldhub.cn").replace(/\/$/, "");

export type EntitlementSnapshot = {
	planTier: "free" | "pro";
	voiceSecondsRemaining: number;
	smartActionsRemaining: number;
};

export async function fetchEntitlements(apiKey: string): Promise<EntitlementSnapshot> {
	const res = await fetch(`${HUB_URL}/api/billing/entitlements`, {
		headers: { Authorization: `Bearer ${apiKey}` },
		signal: AbortSignal.timeout(3000),
	});
	if (!res.ok) {
		throw new Error(`entitlements failed (${res.status})`);
	}
	return (await res.json()) as EntitlementSnapshot;
}

/** Best-effort usage report. Failures are logged; session already completed. */
export async function reportVoiceUsage(input: {
	apiKey: string;
	requestId: string;
	audioSeconds: number;
	mode: string;
	model: string;
}): Promise<void> {
	try {
		await fetch(`${HUB_URL}/api/billing/voice-usage`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${input.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				requestId: input.requestId,
				audioSeconds: input.audioSeconds,
				mode: input.mode,
				model: input.model,
			}),
			signal: AbortSignal.timeout(3000),
		});
	} catch (error) {
		console.warn("[asr-proxy] voice usage report failed", error);
	}
}

/** Logged-in sessions always check quota. Anonymous cloud stays allowed until REQUIRE_AUTH=1. */
export function mustAuthenticate(token: string | null | undefined): boolean {
	if (process.env.ASR_PROXY_SKIP_AUTH === "1") return false;
	if (process.env.ASR_PROXY_REQUIRE_AUTH === "1") return true;
	return Boolean(token?.startsWith("tm_"));
}
