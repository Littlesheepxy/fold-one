import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPost, posts } from "../posts";

type BlogPostPageProps = {
	params: Promise<{ slug: string }>;
};

export const dynamicParams = false;

export function generateStaticParams() {
	return posts.map((post) => ({ slug: post.slug }));
}

export async function generateMetadata({ params }: BlogPostPageProps): Promise<Metadata> {
	const { slug } = await params;
	const post = getPost(slug);
	if (!post) return {};

	return {
		title: post.title,
		description: post.description,
		alternates: { canonical: `/blog/${post.slug}` },
		openGraph: {
			title: post.title,
			description: post.description,
			type: "article",
			publishedTime: post.publishedAt,
			modifiedTime: post.updatedAt,
			authors: [post.author],
			tags: post.tags,
		},
	};
}

export default async function BlogPostPage({ params }: BlogPostPageProps) {
	const { slug } = await params;
	const post = getPost(slug);
	if (!post) notFound();

	const articleJsonLd = {
		"@context": "https://schema.org",
		"@type": "Article",
		headline: post.title,
		description: post.description,
		datePublished: post.publishedAt,
		dateModified: post.updatedAt,
		author: { "@type": "Organization", name: post.author },
		publisher: { "@type": "Organization", name: "知更" },
		mainEntityOfPage: `/blog/${post.slug}`,
		keywords: post.tags.join(","),
	};
	const Post = post.Component;

	return (
		<main className="zg-article-page">
			<script
				type="application/ld+json"
				dangerouslySetInnerHTML={{ __html: JSON.stringify(articleJsonLd).replace(/</g, "\\u003c") }}
			/>
			<header className="zg-article-head">
				<Link href="/blog">返回博客</Link>
				<div>{post.tags.join(" · ")}</div>
				<h1>{post.title}</h1>
				<p>{post.description}</p>
				<time dateTime={post.publishedAt}>{post.publishedAt}</time>
			</header>
			<article className="zg-prose">
				<Post />
			</article>
			<nav className="zg-article-end" aria-label="文章结束">
				<span>继续了解知更</span>
				<Link href="/about">为什么做知更</Link>
				<Link href="/privacy">我们的隐私原则</Link>
			</nav>
		</main>
	);
}
