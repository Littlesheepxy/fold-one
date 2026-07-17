import { createHash } from "node:crypto";
import { basename, dirname, isAbsolute } from "node:path";
import { isOfficeChannelId, runOfficeCli } from "@fold/connectors";
import type { SkillContext } from "../types.js";

const CHANNEL_LABELS: Record<string, string> = {
	feishu: "飞书",
	github: "GitHub",
	dingtalk: "钉钉",
	wecom: "企业微信",
	slack: "Slack",
};

/** receipt 重放保护窗口：超过则视为有意重发，不再拦截。 */
const RECEIPT_REPLAY_WINDOW_MS = 15 * 60_000;

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
	if (/\bdrive\b/.test(full) && /\+?upload|\bupload\b/.test(full)) {
		return "上传文件";
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

/** lark-cli 要求 --file 等为 cwd 内相对路径；绝对路径改成 cwd=dirname + ./basename。 */
function localizeFileArgs(cliArgs: string[]): { args: string[]; cwd?: string } {
	const flags = new Set(["--file", "--image", "--audio", "--video", "--video-cover"]);
	const out = [...cliArgs];
	let cwd: string | undefined;
	for (let i = 0; i < out.length - 1; i++) {
		if (!flags.has(out[i])) continue;
		const p = out[i + 1];
		if (!p || !isAbsolute(p)) continue;
		cwd = dirname(p);
		out[i + 1] = `./${basename(p)}`;
	}
	return { args: out, cwd };
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
		if (/\{\{/.test(targetFingerprint ?? "")) {
			throw new Error(
				`飞书接收人未解析（仍是模板 ${targetFingerprint}）。请先 contact +get-user 取 open_id，或改发给自己。`,
			);
		}
		inputHash = createHash("sha256").update(JSON.stringify(cliArgs)).digest("hex");
		const existingIndex = cliArgs.indexOf("--idempotency-key");
		idempotencyKey = existingIndex >= 0 ? cliArgs[existingIndex + 1] : undefined;
		if (!idempotencyKey) {
			// 稳定派生：同一发送意图跨进程/跨重启得到同一 key，崩溃重启后才能命中旧 receipt；
			// 不再用 per-run taskId 前缀（重启即换新 key，必然查不到旧记录而重复发送）。
			idempotencyKey = `fold:${channel}:${operation}:${inputHash.slice(0, 16)}`;
			cliArgs = [...cliArgs, "--idempotency-key", idempotencyKey];
		}
		const existing = ctx.lookupSideEffectReceipt?.(idempotencyKey);
		// 只有新鲜 receipt 参与重放保护；过期记录视为新的发送意图（允许有意重发同文）。
		const receiptFresh =
			typeof existing?.updatedAt !== "number" || Date.now() - existing.updatedAt <= RECEIPT_REPLAY_WINDOW_MS;
		if (existing && receiptFresh) {
			if (existing.status === "confirmed" && existing.verification && typeof existing.verification === "object") {
				return { ...(existing.verification as Record<string, unknown>), reusedReceipt: true };
			}
			if (existing.status === "requested" || existing.status === "uncertain") {
				// 崩溃窗口：消息可能已发出但状态未落定，盲目重发必然重复。
				const verdict = await ctx.verifySideEffectReceipt?.({
					idempotencyKey,
					connector: channel,
					operation,
					targetFingerprint: targetFingerprint ?? "unknown",
					inputHash,
				});
				if (verdict === "delivered") {
					return {
						...(existing.verification && typeof existing.verification === "object"
							? (existing.verification as Record<string, unknown>)
							: {}),
						ok: true,
						channel,
						stdout: "",
						stderr: "",
						exitCode: 0,
						operation,
						idempotencyKey,
						targetFingerprint,
						inputHash,
						reusedReceipt: true,
						receiptStatus: "confirmed",
					};
				}
				if (verdict !== "not_delivered") {
					// 无法核对：不重发；ok=false 避免 UI 报「已发送」
					return {
						ok: false,
						channel,
						stdout: "",
						stderr: "存在未确认的发送记录，为避免重复发送已跳过，请人工确认后重试",
						exitCode: 1,
						operation,
						idempotencyKey,
						targetFingerprint,
						inputHash,
						reusedReceipt: true,
						receiptStatus: "uncertain",
						note: "存在未确认的发送记录，为避免重复发送已跳过，请人工确认后重试",
					};
				}
				// verdict === "not_delivered"：确认未发出，落入下方正常发送路径。
			}
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
	const localized = localizeFileArgs(cliArgs);
	cliArgs = localized.args;
	const result = ctx.runOfficeCliImpl
		? await ctx.runOfficeCliImpl(channel, cliArgs, 60_000, ctx.signal)
		: await runOfficeCli(channel, cliArgs, 60_000, ctx.signal, localized.cwd);
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
