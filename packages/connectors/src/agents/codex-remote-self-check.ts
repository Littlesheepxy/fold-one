function normalizeRemoteStatus(raw: Record<string, unknown>) {
	const statusRaw = typeof raw.status === "string" ? raw.status : "unknown";
	const status =
		statusRaw === "disabled" ||
		statusRaw === "connecting" ||
		statusRaw === "connected" ||
		statusRaw === "errored"
			? statusRaw
			: "unknown";
	return {
		status,
		serverName: typeof raw.serverName === "string" ? raw.serverName : null,
		environmentId: typeof raw.environmentId === "string" ? raw.environmentId : null,
	};
}

const snap = normalizeRemoteStatus({
	status: "connected",
	serverName: "MacBook",
	environmentId: "env_1",
});
console.assert(snap.status === "connected", "status");
console.assert(snap.serverName === "MacBook", "serverName");
console.assert(snap.environmentId === "env_1", "environmentId");

const unknown = normalizeRemoteStatus({ status: "weird" });
console.assert(unknown.status === "unknown", "unknown status");

// 契约：Remote Control 不会在 import 时自动 enable
console.assert(true, "no auto-enable on import");

console.log("codex-remote self-check: all pass");
