import { createHash } from "node:crypto";
import { isOfficeChannelId, runOfficeCli } from "@fold/connectors";
import type { SkillContext } from "../types.js";

const CHANNEL_LABELS: Record<string, string> = {
	feishu: "飞书",
	github: "GitHub",
	dingtalk: "钉钉",
	wecom: "企业微信",
	slack: "Slack",
};

export function describeOfficeOperation(channel: string, args: string[]): string {
	const command = args.slice(0, 4).join(" ").toLowerCase();
	const full = args.join(" ").toLowerCase();
	if (/\bcontact\b/.test(full) && /\+?get-user|get-self/.test(full)) {
		return "获取本人信息";
	}
	if (
		/(messages?-send|send_message|message send|chat\.postmessage)/.test(full) ||
		(/\/im\/v\d\/messages/.test(full) && /\bpost\b/.test(command))
	) {
		return "发送消息";
	}
	if (/(chat-messages-list|get_message|message (list|get|history))/.test(full)) {
		return "读取消息";
	}
	if (/\btodo\b/.test(full) && /\b(create|add)\b/.test(full)) return "创建待办";
	if (/\btodo\b/.test(full) && /\b(update|patch|complete)\b/.test(full)) return "更新待办";
	if (/\btodo\b/.test(full) && /\b(delete|remove)\b/.test(full)) return "删除待办";
	if (/bitable|base\b/.test(full) && /batch_create|record.*create/.test(full)) return "写入表格";
	if (/bitable|base\b/.test(full) && /\b(create|post)\b/.test(full)) return "创建表格";
	if (/\b(calendar|schedule)\b/.test(full) && /\b(create|add|post)\b/.test(full)) {
		return "创建日程";
	}
	if (/\b(doc|docs|document|wiki)\b/.test(full) && /\b(create|add|post)\b/.test(full)) {
		return "创建文档";
	}
	return "执行操作";
}

function failureMessage(channel: string, stderr: string, stdout: string, exitCode: number): string {
	const label = CHANNEL_LABELS[channel] ?? channel;
	const detail = (stderr || stdout || `退出码 ${exitCode}`).replace(/\s+/g, " ").trim().slice(0, 300);
	return `${label}执行失败：${detail}`;
}

export async function officeCli(args: Record<string, unknown>, ctx: SkillContext) {
	const channel = typeof args.channel === "string" ? args.channel : "";
	if (!isOfficeChannelId(channel)) {
		throw new Error(`office.cli 不支持的渠道: ${channel || "(空)"}`);
	}
	let cliArgs = Array.isArray(args.args) ? args.args.map(String) : [];
	if (cliArgs.length === 0) {
		throw new Error("office.cli 需要 args（CLI 参数数组）");
	}

	const operation = describeOfficeOperation(channel, cliArgs);
	let idempotencyKey: string | undefined;
	let targetFingerprint: string | undefined;
	let inputHash: string | undefined;
	if (channel === "feishu" && operation === "发送消息") {
		const targetIndex = cliArgs.findIndex((arg) => arg === "--user-id" || arg === "--chat-id");
		targetFingerprint = targetIndex >= 0 ? cliArgs[targetIndex + 1] : "unknown";
		inputHash = createHash("sha256").update(JSON.stringify(cliArgs)).digest("hex");
		const existingIndex = cliArgs.indexOf("--idempotency-key");
		idempotencyKey = existingIndex >= 0 ? cliArgs[existingIndex + 1] : undefined;
		if (!idempotencyKey) {
			const runKey = ctx.agentTaskEnvelope?.idempotencyKey ?? "fold:unscoped";
			idempotencyKey = `${runKey}:${inputHash.slice(0, 16)}`;
			cliArgs = [...cliArgs, "--idempotency-key", idempotencyKey];
		}
		const existing = ctx.lookupSideEffectReceipt?.(idempotencyKey);
		if (existing?.status === "confirmed" && existing.verification && typeof existing.verification === "object") {
			return { ...(existing.verification as Record<string, unknown>), reusedReceipt: true };
		}
		ctx.recordSideEffectRequest?.({
			idempotencyKey,
			connector: channel,
			operation,
			targetFingerprint: targetFingerprint ?? "unknown",
			inputHash,
		});
	}
	ctx.emit({
		type: "progress",
		message: `${CHANNEL_LABELS[channel] ?? channel}：${operation}…`,
	});
	const result = await runOfficeCli(channel, cliArgs, 60_000, ctx.signal);
	if (!result.ok) {
		// 非零退出必须成为步骤失败，避免依赖步骤拿坏输出继续执行。
		const error = new Error(failureMessage(channel, result.stderr, result.stdout, result.exitCode)) as Error & {
			stepOutput?: unknown;
		};
		error.stepOutput = {
			...result, operation, idempotencyKey, targetFingerprint, inputHash,
			receiptStatus: idempotencyKey ? "uncertain" : undefined,
		};
		throw error;
	}
	const externalRef =
		result.stdout.match(/(?:message_id|messageId|message-id)["'\s:=]+([\w-]+)/i)?.[1];
	return {
		...result,
		operation,
		idempotencyKey,
		targetFingerprint,
		inputHash,
		externalRef,
	};
}
