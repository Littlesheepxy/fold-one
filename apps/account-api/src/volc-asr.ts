export type VolcAsrTokenPayload = {
	appId: string;
	cluster: string;
	token: string;
	expireAt: string;
};

export function readVolcAsrConfig(): VolcAsrTokenPayload | null {
	const appId = process.env.VOLC_ASR_APP_ID?.trim();
	const token = process.env.VOLC_ASR_TOKEN?.trim();
	const cluster = process.env.VOLC_ASR_CLUSTER?.trim();
	if (!appId || !token || !cluster) return null;
	return {
		appId,
		cluster,
		token,
		expireAt: new Date(Date.now() + 3_600_000).toISOString(),
	};
}
