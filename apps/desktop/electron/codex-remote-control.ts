import {
	getSharedCodexAppServer,
	stopSharedCodexAppServer,
	type CodexRemoteClient,
	type CodexRemotePairing,
	type CodexRemoteStatusSnapshot,
} from "@fold/connectors";

/**
 * Codex Remote Control 控制面。
 * 不自动 enable —— 必须由用户在连接页点击确认。
 */
export async function getCodexRemoteStatus(): Promise<CodexRemoteStatusSnapshot> {
	const client = getSharedCodexAppServer();
	try {
		await client.start();
		return await client.remoteControlStatus();
	} catch (error) {
		return {
			status: "unknown",
			error:
				error instanceof Error
					? error.message
					: "无法连接 Codex App Server。请升级并重装 Codex CLI（需支持 remote-control）。",
		};
	}
}

export async function enableCodexRemoteControl(): Promise<CodexRemoteStatusSnapshot> {
	const client = getSharedCodexAppServer();
	await client.start();
	return client.remoteControlEnable(false);
}

export async function disableCodexRemoteControl(): Promise<CodexRemoteStatusSnapshot> {
	const client = getSharedCodexAppServer();
	await client.start();
	return client.remoteControlDisable(false);
}

export async function startCodexRemotePairing(): Promise<CodexRemotePairing> {
	const client = getSharedCodexAppServer();
	await client.start();
	const status = await client.remoteControlStatus();
	if (status.status === "disabled" || status.status === "unknown") {
		await client.remoteControlEnable(false);
	}
	return client.remoteControlStartPairing(true);
}

export async function pollCodexRemotePairing(input: {
	pairingCode?: string;
	manualPairingCode?: string;
}): Promise<{ claimed: boolean }> {
	const client = getSharedCodexAppServer();
	await client.start();
	return client.remoteControlPairingStatus(input);
}

export async function listCodexRemoteClients(): Promise<{
	environmentId: string | null;
	clients: CodexRemoteClient[];
	error?: string;
}> {
	const client = getSharedCodexAppServer();
	try {
		await client.start();
		const status = await client.remoteControlStatus();
		const environmentId = status.environmentId ?? null;
		if (!environmentId) {
			return { environmentId: null, clients: [] };
		}
		const clients = await client.remoteControlListClients(environmentId);
		return { environmentId, clients };
	} catch (error) {
		return {
			environmentId: null,
			clients: [],
			error: error instanceof Error ? error.message : String(error),
		};
	}
}

export async function revokeCodexRemoteClient(clientId: string): Promise<{ ok: boolean; error?: string }> {
	const client = getSharedCodexAppServer();
	try {
		await client.start();
		const status = await client.remoteControlStatus();
		if (!status.environmentId) return { ok: false, error: "尚未注册远程环境" };
		await client.remoteControlRevokeClient(status.environmentId, clientId);
		return { ok: true };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}

export async function shutdownCodexAppServer(): Promise<void> {
	await stopSharedCodexAppServer();
}
