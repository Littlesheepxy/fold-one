import type { Metadata } from "next";
import Link from "next/link";
import { PageIntro } from "../components/PageSections";
import { posts } from "./posts";

export const metadata: Metadata = {
	title: "博客",
	description: "关于语音输入、工作上下文、本地隐私与知更产品思考的文章。",
	alternates: { canonical: "/blog" },
};

const dateFormatter = new Intl.DateTimeFormat("zh-CN", {
	year: "numeric",
	month: "long",
	day: "numeric",
	timeZone: "UTC",
});

export default function BlogPage() {
	return (
		<main className="zg-subpage">
			<PageIntro eyebrow="知更博客" title="关于表达、工作，以及电脑如何少打扰你一点。">
				<p>我们记录产品选择，也分享如何用更自然的方式完成写作与日常工作。</p>
			</PageIntro>

			<section className="zg-blog-list" aria-label="文章列表">
				{posts.map((post, index) => (
					<article key={post.slug} className={index === 0 ? "is-featured" : ""}>
						<div>
							<span>{post.tags.join(" · ")}</span>
							<time dateTime={post.publishedAt}>
								{dateFormatter.format(new Date(`${post.publishedAt}T00:00:00Z`))}
							</time>
						</div>
						<h2>
							<Link href={`/blog/${post.slug}`}>{post.title}</Link>
						</h2>
						<p>{post.description}</p>
						<Link className="zg-blog-read" href={`/blog/${post.slug}`}>
							阅读全文
						</Link>
					</article>
				))}
			</section>
		</main>
	);
}
