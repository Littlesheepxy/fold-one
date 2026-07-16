import { createWriteStream, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { remainingTrialSmartActions, resolveEntitlements } from "@fold/runtime";
import { loadConfig, saveConfig, applyConfigToEnv } from "./config.js";
import {
	getDefaultLocalModelPath,
	hasLocalWhisperModel,
	LOCAL_VOICE_MODEL_SIZE_MB,
	resolveLocalModelPath,
} from "./local-whisper.js";

const VOICE_PACK_URL =
	"https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin";

export type VoiceSetupMode = "cloud" | "local" | "download-needed";

export interface VoiceSetupStatus {
	planTier: "free" | "pro" | "ultra";
	mode: VoiceSetupMode;
	ready: boolean;
	title: string;
	detail: string;
	downloadSizeMb?: number;
	trialRemaining?: number;
}

export function shouldUseSmartVoice(
	provider: string | undefined,
	hasCloudEntitlement: boolean,
	hasSmartTrial: boolean,
): boolean {
	const localSelected = provider === "local-whisper" || provider === "local-funasr";
	return !localSelected && (hasCloudEntitlement || hasSmartTrial);
}

export function getVoiceSetupStatus(): VoiceSetupStatus {
	const config = loadConfig();
	const tier = resolveEntitlements(config.planTier);
	const hasLocal = hasLocalWhisperModel(config.localWhisperModelPath);
	const trialRemaining = remainingTrialSmartActions(config.trialSmartActionsRemaining);

	if (shouldUseSmartVoice(config.asrProvider, tier.cloudAsr, trialRemaining > 0)) {
		return {
			planTier: tier.tier,
			mode: "cloud",
			ready: true,
			title: "知更智能转写",
			detail: tier.cloudAsr
				? "Pro 已包含场景理解、改口整理与专有名词增强。"
				: `可免费体验 ${trialRemaining} 次场景理解、改口整理与智能代回。`,
			trialRemaining,
		};
	}

	if (hasLocal) {
		return {
			planTier: tier.tier,
			mode: "local",
			ready: true,
			title: "本地语音已就绪",
			detail: "语音在设备本地识别，不上传云端，随时可用。",
			trialRemaining,
		};
	}

	return {
		planTier: tier.tier,
		mode: "download-needed",
		ready: false,
		title: "需要下载离线语音包",
		detail: `下载一次即可离线使用基础转写，约 ${LOCAL_VOICE_MODEL_SIZE_MB} MB。`,
		downloadSizeMb: LOCAL_VOICE_MODEL_SIZE_MB,
		trialRemaining,
	};
}

export async function downloadVoicePack(): Promise<
	{ ok: true; path: string } | { ok: false; error: string }
> {
	const config = loadConfig();
	const targetPath = resolveLocalModelPath(config.localWhisperModelPath);
	try {
		mkdirSync(dirname(targetPath), { recursive: true });
		const response = await fetch(VOICE_PACK_URL);
		if (!response.ok || !response.body) {
			return { ok: false, error: `下载失败（${response.status}）` };
		}
		await pipeline(
			Readable.fromWeb(response.body as import("node:stream/web").ReadableStream),
			createWriteStream(targetPath),
		);
		if (!hasLocalWhisperModel(config.localWhisperModelPath)) {
			return { ok: false, error: "下载完成但文件校验失败，请重试。" };
		}
		if (!config.localWhisperModelPath) {
			const next = {
				...config,
				localWhisperModelPath: getDefaultLocalModelPath(),
			};
			saveConfig(next);
			applyConfigToEnv(next);
		}
		return { ok: true, path: targetPath };
	} catch (error) {
		return { ok: false, error: error instanceof Error ? error.message : String(error) };
	}
}
