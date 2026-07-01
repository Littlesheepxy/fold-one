import { captureScreenshot, type ScreenshotTarget } from "@fold/connectors";
import { extractPdfWithZhipuOcr } from "./zhipu-ocr.js";
import type { SkillContext } from "../types.js";

function parseTarget(value: unknown): ScreenshotTarget {
	const raw = String(value ?? "frontmost").toLowerCase();
	if (raw === "screen" || raw === "full" || raw === "display") return "screen";
	return "frontmost";
}

function wantsOcr(args: Record<string, unknown>): boolean {
	if (args.ocr === true || args.ocr === "true") return true;
	return process.env.FOLD_SCREENSHOT_OCR !== "0" && Boolean(process.env.ZHIPU_API_KEY?.trim());
}

export async function osScreenshot(args: Record<string, unknown>, ctx: SkillContext) {
	const target = parseTarget(args.target);
	ctx.emit({
		type: "progress",
		message: target === "screen" ? "Capturing full screen" : "Capturing frontmost window",
	});

	const shot = await captureScreenshot({ target });
	const result: Record<string, unknown> = {
		path: shot.path,
		target: shot.target,
		bytes: shot.bytes,
		activeApp: ctx.liveContext.activeApp,
		activeWindow: ctx.liveContext.activeWindow,
	};

	if (wantsOcr(args)) {
		ctx.emit({ type: "progress", message: "Running OCR on screenshot" });
		try {
			const ocr = await extractPdfWithZhipuOcr(shot.path);
			result.text = ocr.rawText;
			result.ocrProvider = ocr.ocrProvider;
		} catch (error) {
			result.ocrError = (error as Error).message;
		}
	}

	return result;
}
