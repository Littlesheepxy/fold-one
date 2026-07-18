"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useInView, useReducedMotion } from "framer-motion";
import {
	Check,
	Clock3,
	Command,
	FolderKanban,
	Lock,
	Mic,
	Sparkles,
} from "lucide-react";
import { VoicePill } from "./VoicePill";

const fadeUp = {
	hidden: { opacity: 0, y: 26 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.7, ease: "easeOut" as const } },
};

/** 进入视口后按时间表推进阶段；reduce motion 时直接到终态 */
function usePhases(active: boolean, times: readonly number[], skip: boolean) {
	const [phase, setPhase] = useState(skip ? times.length : 0);
	useEffect(() => {
		if (skip) {
			setPhase(times.length);
			return;
		}
		if (!active) return;
		const timers = times.map((ms, i) => window.setTimeout(() => setPhase(i + 1), ms));
		return () => timers.forEach((t) => window.clearTimeout(t));
	}, [active, skip, times]);
	return phase;
}

/** 标题逐字浮现，进入视口播一次；reduce motion 时直接显示 */
function RevealHeading({ text }: { text: string }) {
	const reduce = Boolean(useReducedMotion());
	if (reduce) return <h2>{text}</h2>;
	return (
		<h2 aria-label={text}>
			<span aria-hidden="true">
				{Array.from(text).map((char, i) => (
					<motion.span
						key={i}
						className="zg-heading-char"
						initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
						whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
						viewport={{ once: true, amount: 0.6 }}
						transition={{ duration: 0.5, delay: 0.024 * i, ease: "easeOut" }}
					>
						{char}
					</motion.span>
				))}
			</span>
		</h2>
	);
}

function FeatureCopy({
	index,
	title,
	lead,
}: {
	index: string;
	title: string;
	lead: string;
}) {
	return (
		<motion.div
			className="zg-feature-copy"
			initial="hidden"
			whileInView="visible"
			viewport={{ once: true, amount: 0.4 }}
			variants={fadeUp}
		>
			<span className="zg-feature-index">{index}</span>
			<RevealHeading text={title} />
			<p>{lead}</p>
		</motion.div>
	);
}

/* ── 01 语音输入 ─────────────────────────────── */

const speakTokens = [
	{ t: "嗯，", kind: "cut" },
	{ t: "那个…", kind: "cut" },
	{ t: "帮我跟设计组说一下，", kind: "keep" },
	{ t: "呃，", kind: "cut" },
	{ t: "评审改到周三", kind: "slip" },
	{ t: "不对，", kind: "cut" },
	{ t: "是周四下午，", kind: "keep" },
	{ t: "把最新的设计稿链接带上。", kind: "keep" },
] as const;

// 1 听写打字 → 2 清理口头语 → 3 转写中(loading) → 4 完成(对勾)+插入 → 5 徽标
const speakPhaseTimes = [300, 3600, 4500, 5600, 6300] as const;

const speakFullText = speakTokens.map((token) => token.t).join("");
const speakOffsets = speakTokens.reduce<number[]>((acc, token, i) => {
	acc.push(i === 0 ? 0 : acc[i - 1]! + speakTokens[i - 1]!.t.length);
	return acc;
}, []);

function speakTokenClass(kind: (typeof speakTokens)[number]["kind"], cleaned: boolean) {
	if (!cleaned || kind === "keep") return "zg-token";
	if (kind === "slip") return "zg-token zg-token-cut zg-token-slip";
	return "zg-token zg-token-cut";
}

function SpeakDemo() {
	const reduce = Boolean(useReducedMotion());
	const ref = useRef<HTMLDivElement | null>(null);
	const inView = useInView(ref, { once: true, amount: 0.45 });
	const phase = usePhases(inView, speakPhaseTimes, reduce);
	const cleaned = phase >= 2;
	const pillState =
		phase === 0 ? "hidden" : phase <= 2 ? "listening" : phase === 3 ? "processing" : "done";
	const typed = useTypewriter(speakFullText, phase >= 1, reduce, 62);
	const typing = phase >= 1 && typed.length < speakFullText.length;

	return (
		<div className="zg-demo-card zg-demo-card--speak" ref={ref}>
			<div className="zg-demo-chrome">
				<Mic size={14} />
				正在听你说…
			</div>
			<p className="zg-speak-raw" aria-label="原始口述逐字出现，口头语与改口被清理">
				{speakTokens.map((token, i) => {
					const visible = Math.max(
						0,
						Math.min(token.t.length, typed.length - speakOffsets[i]!),
					);
					if (visible === 0) return null;
					return (
						<span key={i} className={speakTokenClass(token.kind, cleaned)}>
							{token.t.slice(0, visible)}
						</span>
					);
				})}
				{typing && <span className="zg-typewriter-cursor" aria-hidden="true" />}
			</p>
			<div className="zg-speak-pill-slot">
				<VoicePill state={pillState} appLogo="/brand/icons/feishu.svg" />
			</div>
			<motion.div
				className="zg-speak-compose"
				initial={{ opacity: 0, y: 14 }}
				animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
				transition={{ duration: 0.45 }}
			>
				<div className="zg-speak-compose-head">
					<span className="zg-speak-compose-logo">
						<img src="/brand/icons/feishu.svg" alt="" width={22} height={22} />
					</span>
					<div>
						<strong>飞书 · 项目群</strong>
						<span className="zg-speak-compose-meta">输入框</span>
					</div>
				</div>
				<div className="zg-speak-compose-body">
					<motion.p
						initial={{ opacity: 0 }}
						animate={phase >= 4 ? { opacity: 1 } : { opacity: 0 }}
						transition={{ duration: 0.35 }}
					>
						设计评审改到周四下午，麻烦大家留意；最新的设计稿链接我放在下面。
					</motion.p>
					<div className="zg-speak-compose-bar" aria-hidden="true">
						<span>＋</span>
						<span>Aa</span>
						<span>☺</span>
						<button type="button" tabIndex={-1} disabled>
							发送
						</button>
					</div>
				</div>
				<motion.span
					className="zg-done-badge"
					initial={{ opacity: 0 }}
					animate={phase >= 5 ? { opacity: 1 } : {}}
					transition={{ duration: 0.3 }}
				>
					<Check size={13} />
					已按飞书格式插入
				</motion.span>
			</motion.div>
			<p className="zg-demo-footnote">同一句话，进邮件会更正式，进文档会带上结构 —— 格式跟着目标应用走。</p>
		</div>
	);
}

/* ── 02 Context ─────────────────────────────── */

const contextChips = [
	{ logo: "/zhigeng-mark.png", label: "当前窗口 · Cursor「知更 iOS」" },
	{ logo: "/brand/icons/feishu.svg", label: "最近对话 · 飞书 · Alex" },
	{ logo: "/brand/icons/chrome.svg", label: "打开的网页 · Figma 原型" },
	{ logo: "/brand/icons/clipboard.svg", label: "剪贴板 · 版本规划" },
	{ logo: "/brand/icons/finder.png", label: "项目文件 · 知更 iOS Deck" },
	{ logo: "/zhigeng-mark.png", label: "人名 · Alex" },
	{ logo: "/zhigeng-mark.png", label: "你的表达习惯" },
] as const;

const contextResultText = "Alex，知更 iOS 方案今天定稿，晚点发你终版。";

/** 触发后逐字打出文本，reduce motion 时直接显示全文 */
function useTypewriter(text: string, active: boolean, skip: boolean, speed = 42) {
	const [count, setCount] = useState(skip ? text.length : 0);
	useEffect(() => {
		if (skip) {
			setCount(text.length);
			return;
		}
		if (!active || count >= text.length) return;
		const timeout = window.setTimeout(() => setCount((c) => c + 1), speed);
		return () => window.clearTimeout(timeout);
	}, [active, count, skip, speed, text.length]);
	return text.slice(0, count);
}

const contextPhaseTimes = [900, 1700, 2300, 2900] as const;

function ContextDemo() {
	const reduce = Boolean(useReducedMotion());
	const ref = useRef<HTMLDivElement | null>(null);
	const inView = useInView(ref, { once: true, amount: 0.4 });
	const phase = usePhases(inView, contextPhaseTimes, reduce);
	const typed = useTypewriter(contextResultText, phase >= 4, reduce);
	const typingDone = typed.length >= contextResultText.length;

	return (
		<div className="zg-demo-card" ref={ref}>
			<div className="zg-context-chips" aria-label="知更读取的 Context 来源">
				{contextChips.map((chip, i) => (
					<motion.span
						key={chip.label}
						initial={{ opacity: 0, y: 12 }}
						animate={inView || reduce ? { opacity: 1, y: 0 } : {}}
						transition={{ delay: 0.1 * i, duration: 0.4 }}
					>
						<img src={chip.logo} alt="" width={16} height={16} />
						{chip.label}
					</motion.span>
				))}
			</div>
			{(phase >= 1 || reduce) && (
				<motion.div
					className="zg-context-guess"
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.35 }}
				>
					<span className="zg-context-guess-label">
						<Sparkles size={13} />
						猜你在做
					</span>
					<p>
						你在 Cursor 里推进<strong>知更 iOS</strong>方案，准备跟 Alex 同步定稿。
					</p>
				</motion.div>
			)}
			{phase >= 2 && phase < 4 && !reduce && (
				<motion.div
					className="zg-context-processing"
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.35 }}
				>
					<Sparkles size={14} />
					按这个场景写回复…
				</motion.div>
			)}
			{(phase >= 3 || reduce) && (
				<motion.div
					className="zg-context-result"
					initial={{ opacity: 0, y: 14 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					<motion.p
						className="zg-context-line zg-context-line-raw"
						initial={{ opacity: 0 }}
						animate={phase >= 3 || reduce ? { opacity: 1 } : {}}
						transition={{ duration: 0.35 }}
					>
						<span>你说</span>“跟 alex 说 ios 方案今天定稿”
					</motion.p>
					<p className="zg-context-line">
						<span>知更写</span>
						{phase >= 4 || reduce ? typed : ""}
						{(phase >= 4 || reduce) && !typingDone && <i className="zg-typewriter-cursor" aria-hidden="true" />}
					</p>
					<motion.p
						className="zg-demo-footnote"
						initial={{ opacity: 0 }}
						animate={typingDone ? { opacity: 1 } : {}}
						transition={{ duration: 0.35 }}
					>
						它先猜你在做「知更 iOS」，再把口语补成可直接发出的回复 —— 项目名、称呼、语气都对上了。
					</motion.p>
				</motion.div>
			)}
			<motion.aside
				className="zg-privacy"
				initial={{ opacity: 0 }}
				animate={typingDone ? { opacity: 1 } : {}}
				transition={{ delay: 0.3, duration: 0.4 }}
				aria-label="隐私说明"
			>
				<p className="zg-privacy-title">
					<Lock size={14} />
					<strong>本地优先 · 用完即走</strong>
				</p>
				<p>
					窗口、对话、网页、剪贴板与文件线索默认只在需要时启用，并留在你的 Mac 上。调用模型时，只把完成指令所需的片段直达所选
					AI，不经我们的服务器落盘；所选模型遵循不用于训练的原则。每一项来源都可以单独关闭。
				</p>
				<Link href="/privacy" className="zg-privacy-link">
					了解隐私原则
				</Link>
			</motion.aside>
		</div>
	);
}

/* ── 03 智能写与回 ─────────────────────────────── */

const replyResults = [
	{
		id: "feishu",
		app: "飞书",
		logo: "/brand/icons/feishu.svg",
		scene: "工作 IM · 知更 iOS 群",
		result: "知更 iOS 方案已定稿，最终 Deck 将在周三前同步；今天的结论我也整理好了。",
	},
	{
		id: "gmail",
		app: "Gmail",
		logo: "/brand/icons/gmail.svg",
		scene: "正式邮件 · Sarah",
		result:
			"Hi Sarah, the Zhigeng iOS plan is now finalized. I’ll send the final deck by Wednesday, together with a concise summary of today’s decisions.",
	},
	{
		id: "wechat",
		app: "微信",
		logo: "/brand/icons/wechat.svg",
		scene: "熟人沟通 · 王姐",
		result: "王姐，知更 iOS 定稿啦。最终版周三前发你，今天聊的重点我也顺手整理好了。",
	},
	{
		id: "notion",
		app: "Notion",
		logo: "/brand/icons/notion.svg",
		scene: "文档 · 项目主页",
		title: "知更 iOS · 定稿记录",
		points: ["最终 Deck：周三前发送", "今日决策：已整理至项目页"],
	},
] as const;

const replyStep = (delay: number) => ({
	hidden: { opacity: 0, y: 12 },
	visible: { opacity: 1, y: 0, transition: { delay, duration: 0.4 } },
});

function ReplyDemo() {
	const reduce = Boolean(useReducedMotion());
	const ref = useRef<HTMLDivElement | null>(null);
	const inView = useInView(ref, { once: true, amount: 0.35 });

	return (
		<div className="zg-demo-card zg-reply-demo" ref={ref}>
			<motion.div
				className="zg-reply-intent"
				initial={reduce ? false : "hidden"}
				animate={inView || reduce ? "visible" : "hidden"}
				variants={replyStep(0)}
			>
				<span className="zg-reply-shortcut">
					<Command size={13} />
					<Mic size={13} />
				</span>
				<div>
					<small>长按右 ⌘，随口说</small>
					<p>“知更 iOS 方案定稿了，最终 Deck 周三前发，也把今天的结论整理一下。”</p>
				</div>
			</motion.div>
			<motion.div
				className="zg-reply-results"
				initial={reduce ? false : "hidden"}
				animate={inView || reduce ? "visible" : "hidden"}
			>
				{replyResults.map((result, i) => (
					<motion.article key={result.id} variants={replyStep(0.18 + i * 0.12)}>
						<header>
							<span className="zg-reply-app-logo">
								<img src={result.logo} alt="" width={22} height={22} />
							</span>
							<div>
								<strong>{result.app}</strong>
								<small>{result.scene}</small>
							</div>
						</header>
						{"title" in result ? (
							<div className="zg-reply-notion">
								<b>{result.title}</b>
								<ul>
									{result.points.map((point) => (
										<li key={point}>{point}</li>
									))}
								</ul>
							</div>
						) : (
							<p>{result.result}</p>
						)}
					</motion.article>
				))}
			</motion.div>
			<p className="zg-demo-footnote">同一句意思，进不同应用，就成为语气与结构都合适的样子。</p>
		</div>
	);
}

/* ── 04 Agent 执行 ─────────────────────────────── */

const agentRoutes = [
	{ logo: "/zhigeng-mark.png", label: "知更快捷执行", meta: "消息 · 整理文件 · 授权后执行", direct: true },
	{ logo: "/brand/icons/codex.svg", label: "Codex", meta: "本地已连接" },
	{ logo: "/brand/icons/claude.svg", label: "Claude Code", meta: "本地已连接" },
	{ logo: "/brand/icons/workbuddy.png", label: "WorkBuddy", meta: "本地已连接" },
];

const agentPhaseTimes = [600, 1500, 2600, 3600] as const;

function AgentSection() {
	const reduce = Boolean(useReducedMotion());
	const ref = useRef<HTMLDivElement | null>(null);
	const inView = useInView(ref, { once: true, amount: 0.35 });
	const phase = usePhases(inView, agentPhaseTimes, reduce);

	return (
		<motion.section
			className="zg-agent"
			id="agent"
			aria-label="连接与执行"
			initial={reduce ? false : "hidden"}
			whileInView="visible"
			viewport={{ once: true, amount: 0.2 }}
			variants={fadeUp}
		>
			<div className="zg-agent-head">
				<span className="zg-feature-index">04 · 连接与执行</span>
				<RevealHeading text="接上你已经在用的 Agent" />
				<p>消息、整理文件等简单事项，知更在授权后直接完成；代码与复杂工作，交给本地 Codex、Claude Code 或 WorkBuddy，完成后通知你。</p>
			</div>
			<div ref={ref}>
				<div className="zg-agent-command">
					<Mic size={18} />
					<p>“让 Codex 把这个登录报错修好，跑完测试再告诉我。”</p>
				</div>
				<motion.div
					className="zg-agent-decision"
					initial={{ opacity: 0, y: 8 }}
					animate={phase >= 1 ? { opacity: 1, y: 0 } : {}}
				>
					<span>知更判断</span>
					<strong>代码任务 · 交给本地 Codex</strong>
				</motion.div>
				<ol className="zg-agent-routes">
					{agentRoutes.map((route, i) => {
						const selected = phase >= 2 && i === 1;
						return (
							<li key={route.label} className={selected ? "is-selected" : ""}>
								<span className={`zg-agent-mark${route.direct ? " is-zhigeng" : ""}`}>
									<img src={route.logo} alt="" width={20} height={20} />
								</span>
								<div>
									<strong>{route.label}</strong>
									<small>{route.meta}</small>
								</div>
								{selected && <Check size={15} aria-hidden="true" />}
							</li>
						);
					})}
				</ol>
				<motion.p
					className="zg-agent-done"
					initial={{ opacity: 0, y: 10 }}
					animate={phase >= agentPhaseTimes.length ? { opacity: 1, y: 0 } : {}}
					transition={{ duration: 0.4 }}
				>
					<Check size={15} />
					已交给本地 Codex · 完成后知更会通知你
				</motion.p>
			</div>
		</motion.section>
	);
}

/* ── 05 记忆与主动协助 ─────────────────────────────── */

const followUps = [
	{ person: "Sarah", task: "发送知更 iOS 最终 Deck", time: "周三前", status: "待发送" },
	{ person: "王姐", task: "确认采购报价", time: "今天 17:00", status: "待回复" },
	{ person: "知更 iOS", task: "完成方案定稿", time: "今天", status: "进行中" },
] as const;

const memoryItem = (delay: number) => ({
	hidden: { opacity: 0, y: 14 },
	visible: { opacity: 1, y: 0, transition: { delay, duration: 0.45 } },
});

function MemorySection() {
	const reduce = Boolean(useReducedMotion());

	return (
		<section className="zg-feature zg-feature-panel zg-feature--warm" id="memory" aria-label="记忆与主动协助">
			<FeatureCopy
				index="05 · 记忆"
				title="越用，越懂你的工作方式"
				lead="不只记住你说过什么，也记得你在意谁、正在做什么、答应了什么。可从常用 AI 助手导入画像；使用中沉淀习惯。记忆留在本地，始终属于你。"
			/>
			<motion.div
				className="zg-memory-grid"
				initial={reduce ? false : "hidden"}
				whileInView="visible"
				viewport={{ once: true, amount: 0.3 }}
			>
				<motion.article
					className="zg-memory-entity zg-memory-entity--people"
					variants={memoryItem(0.15)}
				>
					<header className="zg-memory-heading">
						<small>人</small>
						<strong>重要的人与承诺</strong>
					</header>
					<ul className="zg-memory-people">
						<li>
							<img src="/brand/avatars/alex.jpg" alt="Alex" width={38} height={38} />
							<span>
								<strong>Alex</strong>
								<small>视觉设计 · 知更 iOS</small>
								<em>最近承诺 · 周三前给终版</em>
							</span>
						</li>
						<li>
							<img src="/brand/avatars/wang.jpg" alt="王姐" width={38} height={38} />
							<span>
								<strong>王姐</strong>
								<small>采购负责人 · 长期合作</small>
								<em>最近承诺 · 定稿后确认报价</em>
							</span>
						</li>
					</ul>
				</motion.article>
				<motion.article
					className="zg-memory-entity zg-memory-entity--things"
					variants={memoryItem(0.31)}
				>
					<header className="zg-memory-card-head">
						<span className="zg-memory-visual" aria-hidden="true">
							<FolderKanban size={22} />
						</span>
						<span className="zg-memory-heading">
							<small>事</small>
							<strong>知更 iOS · 定稿</strong>
						</span>
					</header>
					<dl className="zg-memory-facts">
						<div>
							<dt>状态</dt>
							<dd><span className="zg-memory-status" />方案已定稿</dd>
						</div>
						<div>
							<dt>截止</dt>
							<dd>周三下班前</dd>
						</div>
						<div>
							<dt>下一步</dt>
							<dd>整理决策并发送最终 Deck</dd>
						</div>
					</dl>
				</motion.article>
				<motion.article
					className="zg-memory-entity zg-memory-entity--self"
					variants={memoryItem(0.47)}
				>
					<header className="zg-memory-self-head">
						<img src="/brand/avatars/user.jpg" alt="你的头像" width={44} height={44} />
						<span className="zg-memory-heading">
							<small>我</small>
							<strong>你的表达习惯</strong>
						</span>
					</header>
					<p className="zg-memory-habits">短句 · 先结论 · 不用感叹号</p>
					<p className="zg-memory-import">
						<Sparkles size={14} aria-hidden="true" />
						已从 AI 助手导入 · 本地记忆
					</p>
				</motion.article>
			</motion.div>
			<motion.div
				className="zg-memory-followups"
				initial={reduce ? false : { opacity: 0, y: 14 }}
				whileInView={{ opacity: 1, y: 0 }}
				viewport={{ once: true, amount: 0.45 }}
				transition={{ delay: reduce ? 0 : 0.45, duration: 0.45 }}
			>
				<header>
					<div>
						<span className="zg-memory-followup-icon">
							<Clock3 size={15} />
						</span>
						<strong>最近需要跟进</strong>
					</div>
					<small>来自本地记忆</small>
				</header>
				<ul>
					{followUps.map((item) => (
						<li key={`${item.person}-${item.task}`}>
							<span>
								<b>{item.person}</b>
								{item.task}
							</span>
							<time>{item.time}</time>
							<em>{item.status}</em>
						</li>
					))}
				</ul>
			</motion.div>
		</section>
	);
}

/* ── 组合 ─────────────────────────────── */

export function FeatureShowcase() {
	return (
		<>
			<section className="zg-feature" id="speak" aria-label="语音输入">
				<FeatureCopy
					index="01 · 语音输入"
					title="一开口，就是可用的文字"
					lead="不是逐字记录你说的话，而是写下你想说的话。"
				/>
				<div className="zg-feature-demo">
					<SpeakDemo />
				</div>
			</section>

			<section className="zg-feature zg-feature-panel zg-feature--soft zg-feature--flip" id="context" aria-label="理解当前工作">
				<FeatureCopy
					index="02 · 理解当下"
					title="它知道你正在做什么"
					lead="先猜你在推进哪件事，再把含糊口令写成可直接发出的回复。窗口、对话与文件线索默认留在本地。"
				/>
				<div className="zg-feature-demo">
					<ContextDemo />
				</div>
			</section>

			<section className="zg-feature" id="reply" aria-label="智能写与回">
				<FeatureCopy
					index="03 · 写与回"
					title="一开口，写与回都恰到好处"
					lead="只说一次大概意思。知更读当前对话，给出多条草案，你选一条插入真实输入框——长按右 ⌘ 即可。"
				/>
				<div className="zg-feature-demo">
					<ReplyDemo />
				</div>
			</section>

			<AgentSection />

			<MemorySection />

			<motion.section
				className="zg-recap"
				aria-label="知更能力总结"
				initial="hidden"
				whileInView="visible"
				viewport={{ once: true, amount: 0.5 }}
				variants={fadeUp}
			>
				<p>
					听懂你说的，看懂你在做的，
					<br />
					替你回、替你办，越用越懂你。
				</p>
			</motion.section>
		</>
	);
}
