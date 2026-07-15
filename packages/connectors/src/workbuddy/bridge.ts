import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { openWorkBuddyApp } from "./app.js";
import {
	discoverWorkBuddyGatewayUrl,
	discoverWorkBuddyMcpAuthHeader,
	discoverWorkBuddyMcpTokenFromProcess,
} from "./discover.js";

const BRIDGE_TTL_MS = 6 * 60 * 60_000;

type WorkBuddyBridgeFile = {
	token: string;
	gatewayUrl: string;
	updatedAt: number;
};

function foldDir(): string {
	return (process.env.FOLD_DATA_DIR ?? join(homedir(), ".fold")).replace(/^~/, homedir());
}

function bridgePath(): string {
	return join(foldDir(), "workbuddy-bridge.json");
}

function pairScriptPath(): string {
	return join(foldDir(), "bin", "pair-workbuddy.sh");
}

export function getWorkBuddyPairingPhrase(): string {
	return "连接 Fold：bash ~/.fold/bin/pair-workbuddy.sh";
}

export function ensureWorkBuddyPairScript(): string {
	const dir = join(foldDir(), "bin");
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const script = `#!/usr/bin/env bash
set -euo pipefail
FOLD_DIR="${foldDir()}"
BRIDGE="$FOLD_DIR/workbuddy-bridge.json"
MCP="$HOME/.workbuddy/.mcp.json"

for _ in $(seq 1 90); do
  if [[ -f "$MCP" ]]; then
    HOST=$(python3 -c "import json,urllib.parse; c=json.load(open('$MCP')); u=c.get('mcpServers',{}).get('connector-proxy',{}).get('url',''); p=urllib.parse.urlparse(u); print(f'{p.scheme}://{p.netloc}' if p.netloc else '')" 2>/dev/null || true)
    if [[ -n "$HOST" ]] && curl -fsS -m 2 "$HOST/health" >/dev/null 2>&1; then
      TOKEN=$(ps aux 2>/dev/null | grep -Eo 'Bearer [A-Za-z0-9_-]{20,}' | head -1 | sed 's/^Bearer //')
      if [[ -z "$TOKEN" ]]; then
        TOKEN=$(ps -ax -o command= 2>/dev/null | grep -Eo 'Bearer [A-Za-z0-9_-]{20,}' | head -1 | sed 's/^Bearer //' || true)
      fi
      if [[ -n "$TOKEN" ]]; then
        mkdir -p "$FOLD_DIR"
        python3 -c "import json,time; json.dump({'token':'$TOKEN','gatewayUrl':'$HOST','updatedAt':int(time.time()*1000)}, open('$BRIDGE','w'))"
        chmod 600 "$BRIDGE"
        echo ok
        exit 0
      fi
    fi
  fi
  sleep 1
done
echo "timeout" >&2
exit 1
`;
	const path = pairScriptPath();
	writeFileSync(path, script, { mode: 0o755 });
	try {
		chmodSync(path, 0o755);
	} catch {
		// ignore
	}
	return path;
}

export function readWorkBuddyBridgeToken(): string | null {
	const data = readWorkBuddyBridge();
	if (!data) return null;
	return data.token;
}

export function readWorkBuddyBridgeGatewayUrl(): string | null {
	const data = readWorkBuddyBridge();
	if (!data?.gatewayUrl?.trim()) return null;
	return data.gatewayUrl.trim().replace(/\/$/, "");
}

function readWorkBuddyBridge(): WorkBuddyBridgeFile | null {
	const path = bridgePath();
	if (!existsSync(path)) return null;
	try {
		const data = JSON.parse(readFileSync(path, "utf8")) as WorkBuddyBridgeFile;
		if (!data.token || !data.updatedAt) return null;
		if (Date.now() - data.updatedAt > BRIDGE_TTL_MS) return null;
		return data;
	} catch {
		return null;
	}
}

export function writeWorkBuddyBridge(token: string, gatewayUrl: string): void {
	const dir = foldDir();
	if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
	const payload: WorkBuddyBridgeFile = {
		token,
		gatewayUrl,
		updatedAt: Date.now(),
	};
	writeFileSync(bridgePath(), JSON.stringify(payload, null, 2), { encoding: "utf8", mode: 0o600 });
}

export function resolveWorkBuddyMcpToken(): string | null {
	const manual = process.env.FOLD_WORKBUDDY_MCP_TOKEN_MANUAL?.trim();
	if (manual) return manual.replace(/^Bearer\s+/i, "");
	const fromBridge = readWorkBuddyBridgeToken();
	if (fromBridge) return fromBridge;
	const fromProcess = discoverWorkBuddyMcpTokenFromProcess();
	if (fromProcess) return fromProcess;
	const fromConfig = discoverWorkBuddyMcpAuthHeader();
	if (fromConfig) return fromConfig.replace(/^Bearer\s+/i, "");
	return null;
}

export function tryPersistWorkBuddyBridge(): boolean {
	const token = discoverWorkBuddyMcpTokenFromProcess();
	const gatewayUrl = discoverWorkBuddyGatewayUrl();
	if (!token || !gatewayUrl) return false;
	writeWorkBuddyBridge(token, gatewayUrl);
	return true;
}

/** 尝试用快捷键在 WorkBuddy 中新建对话，以触发 MCP 子进程与令牌注入。 */
export function wakeWorkBuddySession(): void {
	if (process.platform !== "darwin") return;
	const script = `
tell application "WorkBuddy" to activate
delay 0.6
tell application "System Events"
  if exists (process "WorkBuddy") then
    keystroke "n" using command down
  end if
end tell`;
	spawn("osascript", ["-e", script], { detached: true, stdio: "ignore" }).unref();
}

export function launchWorkBuddyPairScriptInTerminal(): void {
	const script = ensureWorkBuddyPairScript();
	if (process.platform === "darwin") {
		const escaped = script.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
		const cmd = `bash "${escaped}"`;
		const osa = [
			'tell application "Terminal"',
			"  activate",
			`  do script "${cmd}"`,
			"end tell",
		].join("\n");
		spawn("osascript", ["-e", osa], { detached: true, stdio: "ignore" }).unref();
		return;
	}
	spawn("bash", [script], { detached: true, stdio: "ignore" }).unref();
}

export function prepareWorkBuddyPairing(): { copyText: string } {
	ensureWorkBuddyPairScript();
	return { copyText: getWorkBuddyPairingPhrase() };
}

/** 用户复制配对命令后调用：打开 WorkBuddy 并后台轮询 Token。 */
export function activateWorkBuddyPairing(sessionId: string): { opened: boolean; url?: string } {
	const launch = openWorkBuddyApp();
	wakeWorkBuddySession();
	startPairingLoop(sessionId);
	return launch;
}

/** @deprecated 使用 prepare + activate 分步流程 */
export function beginWorkBuddyPairing(sessionId: string): {
	opened: boolean;
	copyText: string;
} {
	const { copyText } = prepareWorkBuddyPairing();
	const launch = activateWorkBuddyPairing(sessionId);
	return { opened: launch.opened, copyText };
}

const pairingLoops = new Map<string, ReturnType<typeof setInterval>>();

function startPairingLoop(sessionId: string): void {
	stopPairingLoop(sessionId);
	let ticks = 0;
	const timer = setInterval(() => {
		ticks += 1;
		tryPersistWorkBuddyBridge();
		if (ticks === 2) wakeWorkBuddySession();
		if (ticks >= 45) stopPairingLoop(sessionId);
	}, 2000);
	pairingLoops.set(sessionId, timer);
}

export function stopPairingLoop(sessionId: string): void {
	const timer = pairingLoops.get(sessionId);
	if (timer) clearInterval(timer);
	pairingLoops.delete(sessionId);
}
