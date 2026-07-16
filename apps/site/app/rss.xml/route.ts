import { posts } from "../blog/posts";
import { siteUrl } from "../lib/site";

function escapeXml(value: string) {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export function GET() {
	const items = posts
		.map(
			(post) => `<item>
				<title>${escapeXml(post.title)}</title>
				<link>${siteUrl}/blog/${post.slug}</link>
				<guid>${siteUrl}/blog/${post.slug}</guid>
				<description>${escapeXml(post.description)}</description>
				<pubDate>${new Date(`${post.publishedAt}T00:00:00Z`).toUTCString()}</pubDate>
			</item>`,
		)
		.join("");
	const xml = `<?xml version="1.0" encoding="UTF-8" ?>
		<rss version="2.0">
			<channel>
				<title>知更博客</title>
				<link>${siteUrl}/blog</link>
				<description>关于表达、工作与知更产品思考的文章。</description>
				<language>zh-CN</language>
				${items}
			</channel>
		</rss>`;

	return new Response(xml, {
		headers: {
			"Content-Type": "application/rss+xml; charset=utf-8",
		},
	});
}
