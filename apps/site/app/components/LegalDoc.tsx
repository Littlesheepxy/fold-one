import type { ReactNode } from "react";

export function LegalDoc({
	eyebrow,
	title,
	updatedAt,
	summary,
	children,
}: {
	eyebrow: string;
	title: string;
	updatedAt: string;
	summary?: ReactNode;
	children: ReactNode;
}) {
	return (
		<main className="zg-subpage zg-legal">
			<header className="zg-page-intro">
				<span>{eyebrow}</span>
				<h1>{title}</h1>
				<div>
					<p className="zg-legal-updated">最近更新：{updatedAt}</p>
					{summary}
				</div>
			</header>
			<article className="zg-legal-body">{children}</article>
		</main>
	);
}

export function LegalSection({
	id,
	title,
	children,
}: {
	id: string;
	title: string;
	children: ReactNode;
}) {
	return (
		<section id={id} className="zg-legal-section">
			<h2>{title}</h2>
			{children}
		</section>
	);
}
