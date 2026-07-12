import { generateText } from "ai";
import { toLanguageModel } from "./providers.js";
import { resolveModelChoice } from "./model-choice.js";

export interface FastTextOptions {
	/** 短文本改写 / 草案生成默认 512 */
	maxOutputTokens?: number;
	temperature?: number;
}

/** 转写净化、代回草案等低延迟场景：限制输出长度、偏低温度。 */
export async function generateFastText(
	prompt: string,
	options: FastTextOptions = {},
): Promise<string> {
	const model = toLanguageModel(resolveModelChoice("fast"));
	const { text } = await generateText({
		model,
		prompt,
		maxOutputTokens: options.maxOutputTokens ?? 512,
		temperature: options.temperature ?? 0.25,
	});
	return text;
}
