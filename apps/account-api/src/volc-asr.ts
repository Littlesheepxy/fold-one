export type VolcAsrTokenPayload = {
	appId: string;
	cluster: string;
	token: string;
	expireAt: string;
};

export function readVolcAsrConfig(): VolcAsrTokenPayload | null {
	const appId = process.env.VOLC_ASR_APP_ID?.trim();
	const rawToken = process.env.VOLC_ASR_TOKEN?.trim();
	const cluster = process.env.VOLC_ASR_CLUSTER?.trim();
	if (!appId || !rawToken || !cluster) return null;
	// Volc SpeechEngine requires "Bearer;{token}" (semicolon, not space).
	const token = rawToken.startsWith("Bearer;") ? rawToken : `Bearer;${rawToken}`;
	return {
		appId,
		cluster,
		token,
		expireAt: new Date(Date.now() + 3_600_000).toISOString(),
	};
}
