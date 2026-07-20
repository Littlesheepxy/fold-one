"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { ArrowRight, Check } from "lucide-react";

type Status = "idle" | "submitting" | "done" | "error";

export function BetaApplyForm() {
	const [status, setStatus] = useState<Status>("idle");
	const [error, setError] = useState("");
	const [email, setEmail] = useState("");
	const [name, setName] = useState("");
	const [company, setCompany] = useState("");
	const [macos, setMacos] = useState("");
	const [useCase, setUseCase] = useState("");
	const [agreeTerms, setAgreeTerms] = useState(false);
	const [agreePrivacy, setAgreePrivacy] = useState(false);
	const [website, setWebsite] = useState(""); // honeypot

	async function onSubmit(event: FormEvent) {
		event.preventDefault();
		setError("");
		setStatus("submitting");
		try {
			const res = await fetch("/api/beta-apply", {
				method: "POST",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					email,
					name,
					company,
					macos,
					useCase,
					agreeTerms,
					agreePrivacy,
					website,
				}),
			});
			const data = (await res.json()) as { ok?: boolean; error?: string; message?: string };
			if (!res.ok || !data.ok) {
				setStatus("error");
				setError(data.error ?? "提交失败，请稍后重试");
				return;
			}
			setStatus("done");
		} catch {
			setStatus("error");
			setError("网络异常，请稍后重试，或直接发邮件至 hello@zhigeng.app");
		}
	}

	if (status === "done") {
		return (
			<div className="zg-beta-done" role="status">
				<span className="zg-beta-done-icon">
					<Check size={22} />
				</span>
				<h2>申请已收到</h2>
				<p>
					我们会按顺序审核。若通过，内测码与安装说明将发送至 <strong>{email}</strong>
					。请留意收件箱与垃圾邮件文件夹。
				</p>
				<p className="zg-beta-done-note">
					也可以先阅读 <Link href="/privacy">隐私政策</Link> 与{" "}
					<Link href="/terms">用户协议</Link>，了解数据如何留在你的 Mac 上。
				</p>
			</div>
		);
	}

	return (
		<form className="zg-beta-form" onSubmit={onSubmit} noValidate>
			<label className="zg-beta-field">
				<span>工作邮箱 *</span>
				<input
					type="email"
					name="email"
					autoComplete="email"
					required
					value={email}
					onChange={(e) => setEmail(e.target.value)}
					placeholder="you@company.com"
				/>
			</label>
			<div className="zg-beta-row">
				<label className="zg-beta-field">
					<span>怎么称呼</span>
					<input
						type="text"
						name="name"
						autoComplete="name"
						value={name}
						onChange={(e) => setName(e.target.value)}
						placeholder="可选"
					/>
				</label>
				<label className="zg-beta-field">
					<span>公司 / 团队</span>
					<input
						type="text"
						name="company"
						value={company}
						onChange={(e) => setCompany(e.target.value)}
						placeholder="可选"
					/>
				</label>
			</div>
			<label className="zg-beta-field">
				<span>macOS 版本</span>
				<select name="macos" value={macos} onChange={(e) => setMacos(e.target.value)}>
					<option value="">不确定 / 稍后告知</option>
					<option value="sequoia">macOS Sequoia 15+</option>
					<option value="sonoma">macOS Sonoma 14</option>
					<option value="ventura">macOS Ventura 13</option>
					<option value="older">更早版本</option>
				</select>
			</label>
			<label className="zg-beta-field">
				<span>你最想用知更解决什么？ *</span>
				<textarea
					name="useCase"
					required
					rows={4}
					value={useCase}
					onChange={(e) => setUseCase(e.target.value)}
					placeholder="例如：每天大量微信/飞书代回、会议后整理纪要、把重复小事交给本机 Agent…"
				/>
			</label>

			{/* honeypot */}
			<label className="zg-beta-hp" aria-hidden="true">
				<span>网站</span>
				<input
					type="text"
					name="website"
					tabIndex={-1}
					autoComplete="off"
					value={website}
					onChange={(e) => setWebsite(e.target.value)}
				/>
			</label>

			<label className="zg-beta-check">
				<input
					type="checkbox"
					checked={agreeTerms}
					onChange={(e) => setAgreeTerms(e.target.checked)}
				/>
				<span>
					我已阅读并同意 <Link href="/terms">《用户协议》</Link>
				</span>
			</label>
			<label className="zg-beta-check">
				<input
					type="checkbox"
					checked={agreePrivacy}
					onChange={(e) => setAgreePrivacy(e.target.checked)}
				/>
				<span>
					我已阅读并同意 <Link href="/privacy">《隐私政策》</Link>
				</span>
			</label>

			{error ? <p className="zg-beta-error">{error}</p> : null}

			<button className="zg-primary" type="submit" disabled={status === "submitting"}>
				{status === "submitting" ? "提交中…" : "申请内测码"}
				{status !== "submitting" ? <ArrowRight size={18} /> : null}
			</button>
			<p className="zg-beta-alt">
				表单不便时，也可直接邮件{" "}
				<a href="mailto:hello@zhigeng.app?subject=%E7%94%B3%E8%AF%B7%E7%9F%A5%E6%9B%B4%E5%86%85%E6%B5%8B%E7%A0%81">
					hello@zhigeng.app
				</a>
			</p>
		</form>
	);
}
