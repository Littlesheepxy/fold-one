import { existsSync } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, extname } from "node:path";
import { fileURLToPath } from "node:url";
import {
	countMailUnread,
	createMailDraft,
	connectorLabel,
	openMail,
	resolveMailConnectorAsync,
	runPython,
} from "@fold/connectors";
import type { SkillContext } from "../types.js";
import { resolveClipboardRecall } from "@fold/context";
import { extractPdfWithZhipuOcr, hasUsefulPdfFields } from "./zhipu-ocr.js";

/** Vite dev 下 import.meta.url 可能是 http://…/@fs/…，不能直接 fileURLToPath。 */
function resolveSkillScript(relativeFromBuiltin: string): string {
	const url = new URL(relativeFromBuiltin, import.meta.url);
	const candidates: string[] = [];
	if (url.protocol === "file:") candidates.push(fileURLToPath(url));
	else if (url.pathname.startsWith("/@fs/")) {
		candidates.push(decodeURIComponent(url.pathname.slice("/@fs".length)));
	}
	candidates.push(join(process.cwd(), "packages/skills/scripts", basename(relativeFromBuiltin)));
	for (const p of candidates) {
		if (p && existsSync(p)) return p;
	}
	throw new Error(`Skill script not found: ${basename(relativeFromBuiltin)}`);
}

function normalizeLocalPath(path: string): string {
	const trimmed = path.trim();
	if (!trimmed.startsWith("file://")) return trimmed;
	try {
		return fileURLToPath(new URL(trimmed));
	} catch {
		return decodeURIComponent(trimmed.replace(/^file:\/\//, ""));
	}
}

function parseSince(since?: string): number {
	if (!since) return 30 * 60 * 1000;
	const m = since.match(/^(\d+)(m|h)$/);
	if (!m) return 30 * 60 * 1000;
	const n = Number(m[1]);
	return m[2] === "h" ? n * 3600_000 : n * 60_000;
}

export async function finderLatestDownload(
	args: Record<string, unknown>,
	ctx: SkillContext,
) {
	const ext = (args.ext as string | undefined)?.toLowerCase();
	const sinceMs = parseSince(args.since as string | undefined);
	const cutoff = Date.now() - sinceMs;
	const downloads = join(homedir(), "Downloads");

	// Prefer live context recent files
	for (const f of ctx.liveContext.recentFiles) {
		if (f.timestamp < cutoff) continue;
		if (ext && !f.path.toLowerCase().endsWith(`.${ext}`)) continue;
		return { path: f.path, name: f.name, size: 0 };
	}

	const entries = await readdir(downloads);
	let best: { path: string; name: string; size: number; mtime: number } | null = null;

	for (const name of entries) {
		if (name.startsWith(".")) continue;
		if (ext && extname(name).toLowerCase() !== `.${ext}`) continue;
		const path = join(downloads, name);
		const s = await stat(path);
		if (!s.isFile()) continue;
		if (s.mtimeMs < cutoff) continue;
		if (!best || s.mtimeMs > best.mtime) {
			best = { path, name, size: s.size, mtime: s.mtimeMs };
		}
	}

	if (!best) throw new Error("No matching download found");
	return { path: best.path, name: best.name, size: best.size };
}

export async function pdfExtract(args: Record<string, unknown>, ctx: SkillContext) {
	let path = args.path as string | undefined;
	if (!path) {
		for (const [, v] of ctx.previousResults) {
			if (v && typeof v === "object" && "path" in (v as object)) {
				path = (v as { path: string }).path;
				break;
			}
		}
	}
	if (!path) throw new Error("pdf.extract: path required");
	path = normalizeLocalPath(path);

	ctx.emit({ type: "progress", message: "Reading PDF" });

	const scriptPath = resolveSkillScript("../../scripts/extract_pdf.py");
	const stdout = await runPython(scriptPath, [path]);
	const parsed = JSON.parse(stdout) as Record<string, unknown>;
	if (hasUsefulPdfFields(parsed)) return parsed;

	ctx.emit({ type: "progress", message: "OCR fallback with Zhipu" });
	return extractPdfWithZhipuOcr(path);
}

export async function mailDraft(args: Record<string, unknown>, ctx: SkillContext) {
	const to = String(args.to ?? "Jason");
	let body = args.body as string | undefined;
	const subject = (args.subject as string | undefined) ?? "Quote Summary";

	if (!body) {
		for (const [, v] of ctx.previousResults) {
			if (v && typeof v === "object") {
				const o = v as Record<string, unknown>;
				const parts: string[] = [];
				if (o.vendor) parts.push(`Vendor: ${o.vendor}`);
				if (o.amount) parts.push(`Amount: ${o.amount}`);
				if (o.date) parts.push(`Date: ${o.date}`);
				if (o.rawText) parts.push(String(o.rawText).slice(0, 500));
				if (parts.length) body = parts.join("\n");
			}
		}
	}
	body = body ?? "Please find the quote summary attached.";

	const result = await createMailDraft(
		{ to, subject, body, toEmail: args.toEmail as string | undefined },
		{
			context: mailContext(ctx),
			onProgress: (message) => ctx.emit({ type: "progress", message }),
		},
	);

	return result;
}

function mailContext(ctx: SkillContext) {
	return {
		activeApp: ctx.liveContext.activeApp,
		activeWindow: ctx.liveContext.activeWindow,
		recentUrls: ctx.liveContext.recentUrls,
		intent: ctx.taskIntent,
	};
}

export async function mailOpen(_args: Record<string, unknown>, ctx: SkillContext) {
	const connectorId = await resolveMailConnectorAsync(undefined, mailContext(ctx));
	ctx.emit({ type: "progress", message: `Opening ${connectorLabel(connectorId)}` });
	return openMail({
		context: mailContext(ctx),
		onProgress: (message) => ctx.emit({ type: "progress", message }),
	});
}

export async function mailCountUnread(_args: Record<string, unknown>, ctx: SkillContext) {
	const connectorId = await resolveMailConnectorAsync(undefined, mailContext(ctx));
	ctx.emit({ type: "progress", message: `Counting ${connectorLabel(connectorId)} unread messages` });
	return countMailUnread({
		context: mailContext(ctx),
		onProgress: (message) => ctx.emit({ type: "progress", message }),
	});
}

export async function clipboardRead(_args: Record<string, unknown>, _ctx: SkillContext) {
	const { runShell } = await import("@fold/connectors");
	const text = await runShell("pbpaste", []);
	return { text: text.trim() };
}

export async function clipboardRecall(args: Record<string, unknown>, ctx: SkillContext) {
	const query = String(args.query ?? args.intent ?? "").trim();
	ctx.emit({ type: "progress", message: "正在查找复制记录…" });
	return resolveClipboardRecall(query, ctx.liveContext.recentClipboards ?? []);
}
