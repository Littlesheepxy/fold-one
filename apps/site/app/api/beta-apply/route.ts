import { NextResponse } from "next/server";

type BetaBody = {
	email?: string;
	name?: string;
	useCase?: string;
	macos?: string;
	company?: string;
	website?: string; // honeypot
	agreeTerms?: boolean;
	agreePrivacy?: boolean;
};

function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function POST(request: Request) {
	let body: BetaBody;
	try {
		body = (await request.json()) as BetaBody;
	} catch {
		return NextResponse.json({ ok: false, error: "请求格式无效" }, { status: 400 });
	}

	// 机器人蜜罐：有值则假装成功
	if (body.website?.trim()) {
		return NextResponse.json({ ok: true });
	}

	const email = body.email?.trim().toLowerCase() ?? "";
	const useCase = body.useCase?.trim() ?? "";
	const name = body.name?.trim() ?? "";
	const macos = body.macos?.trim() ?? "";
	const company = body.company?.trim() ?? "";

	if (!isEmail(email)) {
		return NextResponse.json({ ok: false, error: "请填写有效邮箱" }, { status: 400 });
	}
	if (useCase.length < 8) {
		return NextResponse.json({ ok: false, error: "请简单说明你的使用场景（至少几句话）" }, { status: 400 });
	}
	if (!body.agreeTerms || !body.agreePrivacy) {
		return NextResponse.json({ ok: false, error: "请先同意用户协议与隐私政策" }, { status: 400 });
	}

	const payload = {
		type: "beta_apply",
		email,
		name: name || undefined,
		company: company || undefined,
		macos: macos || undefined,
		useCase,
		at: new Date().toISOString(),
		userAgent: request.headers.get("user-agent")?.slice(0, 200) ?? undefined,
	};

	const webhook = process.env.BETA_APPLY_WEBHOOK_URL?.trim();
	if (webhook) {
		try {
			const res = await fetch(webhook, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify(payload),
			});
			if (!res.ok) {
				console.error("[beta-apply] webhook failed", res.status);
				return NextResponse.json({ ok: false, error: "提交失败，请稍后重试或发邮件联系我们" }, { status: 502 });
			}
		} catch (error) {
			console.error("[beta-apply] webhook error", error);
			return NextResponse.json({ ok: false, error: "提交失败，请稍后重试或发邮件联系我们" }, { status: 502 });
		}
	} else {
		// 未配置 webhook 时仍接受申请（本地/预览环境），便于联调；生产请配置 BETA_APPLY_WEBHOOK_URL。
		console.info("[beta-apply]", JSON.stringify(payload));
	}

	return NextResponse.json({
		ok: true,
		message: "已收到申请。若通过，内测码将发送至你的邮箱。",
	});
}
