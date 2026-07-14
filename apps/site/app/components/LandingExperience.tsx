"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Transition } from "framer-motion";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { HeroHighlight, Highlight } from "./HeroHighlight";
import { FeatureShowcase } from "./FeatureModules";

const heroSentence = "知更，知你所言，才更懂你意。";
const heroSentenceParts = [
	{ text: "知更", className: "zg-hero-brand" },
	{ text: "，知你所言，才", className: "" },
	{ text: "更懂你意", className: "zg-hero-emphasis" },
	{ text: "。", className: "" },
];

const fadeUp = {
	hidden: { opacity: 0.001, y: 24 },
	visible: { opacity: 1, y: 0 },
};

export function LandingExperience() {
	const reduceMotion = useReducedMotion();
	const [isScrolled, setIsScrolled] = useState(false);
	const transition: Transition = reduceMotion ? { duration: 0 } : { duration: 0.7, ease: "easeOut" };

	useEffect(() => {
		const updateHeader = () => setIsScrolled(window.scrollY > 40);
		updateHeader();
		window.addEventListener("scroll", updateHeader, { passive: true });
		return () => window.removeEventListener("scroll", updateHeader);
	}, []);

	return (
		<main className="zg-page">
			<motion.header
				className={`zg-nav${isScrolled ? " zg-nav-scrolled" : ""}`}
				aria-label="主导航"
				initial="hidden"
				animate="visible"
				variants={fadeUp}
				transition={transition}
			>
				<a className="zg-brand" href="#top" aria-label="知更首页">
					<Image src="/zhigeng-mark.png" alt="" width={44} height={44} priority />
					<span>知更</span>
				</a>
				<nav className="zg-nav-links" aria-label="页面导航">
					<a href="#speak">语音输入</a>
					<a href="#reply">智能代回</a>
					<a href="#agent">Agent</a>
					<a href="#pricing">定价</a>
				</nav>
				<a className="zg-nav-cta" href="#download">
					下载 macOS
				</a>
			</motion.header>

			<section className="zg-hero" id="top">
				<motion.div
					className="zg-hero-copy"
					initial="hidden"
					animate="visible"
					variants={fadeUp}
					transition={{ ...transition, delay: 0.08 }}
				>
					<HeroHighlight>
						<HeroTypewriter reduceMotion={Boolean(reduceMotion)} />
						<p className="zg-hero-message">
							<strong>懂你正在做什么的 AI 语音输入。</strong>
							<span>
								你说：「把讨论整理成三条结论发到项目群，评审加进日历。」
								<br />
								然后，它真的做完了。
							</span>
						</p>
						<div className="zg-actions" id="download">
							<a className="zg-primary" href="#download">
								下载 macOS
								<ArrowRight size={18} />
							</a>
							<a className="zg-secondary" href="#speak">
								看看它怎么做
							</a>
						</div>
					</HeroHighlight>
				</motion.div>
			</section>

			<FeatureShowcase />

			<motion.section
				className="zg-pricing"
				id="pricing"
				aria-label="定价"
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true, amount: 0.34 }}
				variants={fadeUp}
				transition={transition}
			>
				<div>
					<span>内测开放中</span>
					<h2>让真正懂你的助手，开始替你做事。</h2>
				</div>
				<p>macOS 版本优先开放。个人版包含 AI 语音理解、Context 感知、个人 Profile 与 Agent 执行；团队版将增加共享知识与协作能力。</p>
				<a className="zg-secondary" href="#download">
					加入等待名单
				</a>
			</motion.section>
		</main>
	);
}

function HeroTypewriter({ reduceMotion }: { reduceMotion: boolean }) {
	const [charCount, setCharCount] = useState(reduceMotion ? heroSentence.length : 0);

	useEffect(() => {
		if (reduceMotion) {
			setCharCount(heroSentence.length);
			return;
		}

		if (charCount >= heroSentence.length) return;

		const timeout = window.setTimeout(
			() => setCharCount((value) => value + 1),
			charCount === 0 ? 420 : 82,
		);

		return () => window.clearTimeout(timeout);
	}, [charCount, reduceMotion]);

	let remainingCharacters = charCount;
	const isComplete = charCount >= heroSentence.length;

	return (
		<h1 aria-label={heroSentence}>
			<span aria-hidden="true">
				{heroSentenceParts.map((part) => {
					const visibleText = part.text.slice(0, Math.max(0, remainingCharacters));
					remainingCharacters -= part.text.length;
					if (part.className === "zg-hero-emphasis") {
						return (
							<Highlight active={isComplete} key={part.text} reduceMotion={reduceMotion}>
								{visibleText}
							</Highlight>
						);
					}
					return (
						<span className={part.className} key={part.text}>
							{visibleText}
						</span>
					);
				})}
				<span className="zg-typewriter-cursor" aria-hidden="true" />
			</span>
		</h1>
	);
}
