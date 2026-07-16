import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";

export function PageIntro({
	eyebrow,
	title,
	children,
}: {
	eyebrow: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<header className="zg-page-intro">
			<span>{eyebrow}</span>
			<h1>{title}</h1>
			<div>{children}</div>
		</header>
	);
}

export function PageCta({
	title = "你说一句，它写好；说到，也能做到。",
}: {
	title?: string;
}) {
	return (
		<section className="zg-page-cta">
			<h2>{title}</h2>
			<p>知更正在开放 macOS 内测。</p>
			<Link className="zg-primary" href="/pricing">
				申请 macOS 内测
				<ArrowRight size={18} />
			</Link>
		</section>
	);
}
