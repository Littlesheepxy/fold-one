import { readFile } from "node:fs/promises";

const ZHIPU_LAYOUT_ENDPOINT = "https://open.bigmodel.cn/api/paas/v4/layout_parsing";

export interface PdfFields {
	vendor: string | null;
	amount: string | null;
	date: string | null;
	rawText: string;
	ocrProvider?: string;
}

function hasFieldValue(result: Record<string, unknown>): boolean {
	return ["vendor", "amount", "date", "rawText"].some((key) => {
		const value = result[key];
		return value != null && String(value).trim() !== "";
	});
}

export function hasUsefulPdfFields(result: Record<string, unknown>): boolean {
	if (!hasFieldValue(result)) return false;
	const rawText = String(result.rawText ?? "");
	return !rawText.startsWith("(install pdfplumber:");
}

export function extractFieldsFromText(text: string): PdfFields {
	let vendor: string | null = null;
	let amount: string | null = null;
	let date: string | null = null;

	const amountMatch = text.match(/(?:[$¥€￥]\s*[\d,]+(?:\.\d{2})?)|(?:人民币|RMB|CNY)\s*[\d,]+(?:\.\d{2})?/i);
	if (amountMatch) amount = amountMatch[0].trim();

	const dateMatch = text.match(/\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?/);
	if (dateMatch) date = dateMatch[0].trim();

	for (const line of text.split(/\r?\n/).slice(0, 40)) {
		if (/vendor|supplier|company|报价方|供应商|公司|客户/i.test(line)) {
			vendor = line.trim().slice(0, 80);
			break;
		}
	}

	return {
		vendor,
		amount,
		date,
		rawText: text.slice(0, 2000),
	};
}

function collectText(value: unknown): string {
	if (typeof value === "string") return value;
	if (Array.isArray(value)) return value.map(collectText).filter(Boolean).join("\n");
	if (!value || typeof value !== "object") return "";

	const obj = value as Record<string, unknown>;
	const preferred = ["md_results", "markdown", "text", "content", "result"];
	const parts = preferred.map((key) => collectText(obj[key])).filter(Boolean);

	if (parts.length > 0) return parts.join("\n");
	return Object.values(obj).map(collectText).filter(Boolean).join("\n");
}

async function fileToDataUri(path: string): Promise<string> {
	const bytes = await readFile(path);
	let mime = "application/octet-stream";
	if (bytes.subarray(0, 5).toString() === "%PDF-") mime = "application/pdf";
	else if (bytes[0] === 0x89 && bytes[1] === 0x50) mime = "image/png";
	else if (bytes[0] === 0xff && bytes[1] === 0xd8) mime = "image/jpeg";
	return `data:${mime};base64,${bytes.toString("base64")}`;
}

export async function extractPdfWithZhipuOcr(path: string): Promise<PdfFields> {
	const apiKey = process.env.ZHIPU_API_KEY?.trim().replace(/^["']|["']$/g, "");
	if (!apiKey) {
		throw new Error("ZHIPU_API_KEY missing for OCR fallback");
	}

	const res = await fetch(ZHIPU_LAYOUT_ENDPOINT, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			model: process.env.ZHIPU_OCR_MODEL ?? "glm-ocr",
			file: await fileToDataUri(path),
		}),
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`Zhipu OCR failed (${res.status}): ${body.slice(0, 300)}`);
	}

	const payload = (await res.json()) as unknown;
	const text = collectText(payload);
	return { ...extractFieldsFromText(text), ocrProvider: "zhipu" };
}
