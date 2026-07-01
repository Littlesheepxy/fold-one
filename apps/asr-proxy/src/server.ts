/**
 * Fold ASR Proxy — port 3003, path /asr/stream
 */
import { createServer, type IncomingMessage } from "node:http";
import { WebSocketServer } from "ws";
import { attachAsrSession } from "./session.js";

const PORT = Number(process.env.ASR_PROXY_PORT ?? 3003);
const API_KEY = (process.env.DASHSCOPE_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
const DEFAULT_MODEL = process.env.DASHSCOPE_ASR_MODEL ?? "fun-asr-realtime";

if (!API_KEY) {
	console.warn("[asr-proxy] DASHSCOPE_API_KEY missing — ASR will fail until configured.");
}

const server = createServer((req, res) => {
	if (req.url === "/health" || req.url === "/asr/health") {
		res.writeHead(200, { "Content-Type": "application/json" });
		res.end(JSON.stringify({ ok: true, model: DEFAULT_MODEL, hasKey: !!API_KEY }));
		return;
	}
	res.writeHead(404, { "Content-Type": "application/json" });
	res.end(JSON.stringify({ ok: false, error: "not found" }));
});

const wss = new WebSocketServer({ noServer: true });

server.on("upgrade", (req: IncomingMessage, socket, head) => {
	const url = req.url ?? "";
	if (!url.startsWith("/asr/stream")) {
		socket.destroy();
		return;
	}
	wss.handleUpgrade(req, socket, head, (ws) => {
		attachAsrSession(ws, { apiKey: API_KEY, defaultModel: DEFAULT_MODEL });
	});
});

server.listen(PORT, () => {
	console.log(`[asr-proxy] listening on :${PORT}, model=${DEFAULT_MODEL}`);
});
