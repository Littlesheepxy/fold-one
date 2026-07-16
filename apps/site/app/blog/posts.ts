import type { ComponentType } from "react";
import LocalContext, { metadata as localContextMetadata } from "../../content/blog/local-context-and-privacy.mdx";
import VoiceInput, { metadata as voiceInputMetadata } from "../../content/blog/voice-input-that-reads-like-you.mdx";
import WhyZhigeng, { metadata as whyZhigengMetadata } from "../../content/blog/why-zhigeng.mdx";

export type BlogPost = {
	slug: string;
	title: string;
	description: string;
	publishedAt: string;
	updatedAt: string;
	author: string;
	tags: string[];
	Component: ComponentType;
};

export const posts: BlogPost[] = [
	{ slug: "why-zhigeng", ...whyZhigengMetadata, Component: WhyZhigeng },
	{ slug: "voice-input-that-reads-like-you", ...voiceInputMetadata, Component: VoiceInput },
	{ slug: "local-context-and-privacy", ...localContextMetadata, Component: LocalContext },
].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));

export function getPost(slug: string) {
	return posts.find((post) => post.slug === slug);
}
