import type { MetadataRoute } from "next";
import { posts } from "./blog/posts";
import { siteUrl } from "./lib/site";

export default function sitemap(): MetadataRoute.Sitemap {
	const pages = ["", "/pricing", "/about", "/privacy", "/terms", "/beta", "/blog"].map((path) => ({
		url: `${siteUrl}${path}`,
		lastModified: new Date(),
		changeFrequency: path === "/blog" ? ("weekly" as const) : ("monthly" as const),
		priority: path === "" ? 1 : 0.8,
	}));
	const articles = posts.map((post) => ({
		url: `${siteUrl}/blog/${post.slug}`,
		lastModified: new Date(`${post.updatedAt}T00:00:00Z`),
		changeFrequency: "monthly" as const,
		priority: 0.7,
	}));

	return [...pages, ...articles];
}
