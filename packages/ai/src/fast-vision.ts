import { readFile } from "node:fs/promises";
import { resolveModelChoice, hasFastVisionApiKey } from "./model-choice.js";
import { PROVIDER_TABLE, type ModelChoice } from "./types.js";
import type { GatewayFeature } from "./gateway.js";

export interface FastVisionImage {
	/** Local file path, or already-encoded data URI */
	path?: string;
	dataUri?: string;
	mimeType?: string;
}

export interface FastVisionOptions {
	maxOutputTokens?: number;
	temperature?: number;
	feature?: GatewayFeature;
	operationId?: string;
}

async function toDataUri(image: FastVisionImage): Promise<string> {
	if (image.dataUri?.startsWith("data:")) return image.dataUri;
	if (!image.path) throw new Error("[fast-vision] image path or dataUri required");
	const bytes = await readFile(image.path);
	const mime =
		image.mimeType ??
		(image.path.toLowerCase().endsWith(".jpg") || image.path.toLowerCase().endsWith(".jpeg")
			? "image/jpeg"
			: "image/png");
	return `data:${mime};base64,${bytes.toString("base64")}`;
}

function extractText(payload: unknown): string {
	const root = payload as {
		choices?: Array<{ message?: { content?: unknown } }>;
		error?: { message?: string };
	};
	if (root.error?.message) throw new Error(root.error.message);
	const content = root.choices?.[0]?.message?.content;
	if (typeof content === "string") return content.trim();
	if (Array.isArray(content)) {
		return content
			.map((part) => {
				if (typeof part === "string") return part;
				if (part && typeof part === "object" && "text" in part) {
					return String((part as { text: unknown }).text ?? "");
				}
				return "";
			})
			.join("")
			.trim();
	}
	return "";
}

/**
 * 截图 → 多模态模型直接出文。
 * 智谱 glm-5v-turbo 默认开 thinking，代回场景显式关闭以压延迟。
 * glm-5.2 是纯文本旗舰，看图请用本函数的 vision 路由，不要塞 5.2。
 */
export async function generateFastVision(
	prompt: string,
	image: FastVisionImage,
	options: FastVisionOptions = {},
): Promise<string> {
	if (!hasFastVisionApiKey()) {
		throw new Error("[fast-vision] no domestic vision API key");
	}
	const choice = resolveModelChoice("fastVision");
	const cfg = PROVIDER_TABLE[choice.provider];
	const apiKey = process.env[cfg.apiKeyEnv]?.trim().replace(/^["']|["']$/g, "");
	if (!apiKey) throw new Error(`[fast-vision] missing ${cfg.apiKeyEnv}`);

	const dataUri = await toDataUri(image);
	const body: Record<string, unknown> = {
		model: choice.model,
		messages: [
			{
				role: "user",
				content: [
					{ type: "image_url", image_url: { url: dataUri } },
					{ type: "text", text: prompt },
				],
			},
		],
		max_tokens: options.maxOutputTokens ?? 640,
		temperature: options.temperature ?? 0.35,
	};
	if (choice.provider === "zhipu") {
		body.thinking = { type: "disabled" };
	}

	const res = await fetch(`${cfg.baseURL}/chat/completions`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});
	const json = (await res.json()) as unknown;
	if (!res.ok) {
		const msg =
			(json as { error?: { message?: string } })?.error?.message ??
			`HTTP ${res.status}`;
		throw new Error(`[fast-vision] ${choice.provider}/${choice.model}: ${msg}`);
	}
	const text = extractText(json);
	if (!text) throw new Error(`[fast-vision] empty response from ${choice.model}`);
	return text;
}

export function describeFastVisionChoice(): ModelChoice {
	return resolveModelChoice("fastVision");
}
