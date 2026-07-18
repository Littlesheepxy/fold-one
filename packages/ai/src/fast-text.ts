import { resolveModelChoice } from "./model-choice.js";
import { gatewayGenerateText, type GatewayFeature } from "./gateway.js";

export interface FastTextOptions {
	/** 短文本改写 / 草案生成默认 512 */
	maxOutputTokens?: number;
	temperature?: number;
	feature?: GatewayFeature;
	operationId?: string;
}

/** 转写净化、代回草案等低延迟场景：限制输出长度、偏低温度。 */
export async function generateFastText(
	prompt: string,
	options: FastTextOptions = {},
): Promise<string> {
	const choice = resolveModelChoice("fast");
	const { text } = await gatewayGenerateText(
		choice,
		{
			prompt,
			maxOutputTokens: options.maxOutputTokens ?? 512,
			// Kimi Code Plan（moonshot 走该 baseURL 时）只接受 temperature=1，非 1 直接 400。
			temperature: choice.provider === "moonshot" ? 1 : options.temperature ?? 0.25,
		},
		{
			feature: options.feature ?? "voice_structure",
			operationId: options.operationId,
		},
	);
	return text;
}
