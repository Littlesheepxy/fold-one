"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useInView, useReducedMotion } from "framer-motion";
import {
	BookMarked,
	Calendar,
	Check,
	ClipboardList,
	Command,
	FileText,
	Globe,
	History,
	Lock,
	Mail,
	MessageSquare,
	Mic,
	RotateCcw,
	Sparkles,
	Table2,
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
	points,
}: {
	index: string;
	title: string;
	lead: string;
	points?: string[];
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
			{points && (
				<ul className="zg-feature-points">
					{points.map((point) => (
						<li key={point}>
							<Check size={15} />
							{point}
						</li>
					))}
				</ul>
			)}
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

const speakPhaseTimes = [300, 3400, 4300, 5100] as const;

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
	const listening = phase >= 1 && phase < 3;
	const showPill = phase >= 1 || reduce;

	return (
		<div className="zg-demo-card zg-demo-card--speak" ref={ref}>
			<div className="zg-demo-chrome">
				<Mic size={14} />
				正在听你说…
			</div>
			<p className="zg-speak-raw" aria-label="原始口述逐字出现，口头语与改口被清理">
				{speakTokens.map((token, i) => (
					<motion.span
						key={i}
						className={speakTokenClass(token.kind, cleaned)}
						initial={{ opacity: 0, y: 8 }}
						animate={
							phase >= 1
								? { opacity: cleaned && token.kind !== "keep" ? 0.88 : 1, y: 0 }
								: {}
						}
						transition={{ delay: phase === 1 ? 0.3 * i : 0, duration: 0.32 }}
					>
						{token.t}
					</motion.span>
				))}
			</p>
			<div className="zg-speak-pill-slot">
				<VoicePill active={listening} visible={showPill} />
			</div>
			<motion.div
				className="zg-speak-compose"
				initial={{ opacity: 0, y: 14 }}
				animate={phase >= 3 ? { opacity: 1, y: 0 } : {}}
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
					<p>设计评审改到周四下午，麻烦大家留意；最新的设计稿链接我放在下面。</p>
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
					animate={phase >= 4 ? { opacity: 1 } : {}}
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
	{ logo: "/brand/icons/feishu.svg", label: "当前窗口 · 飞书「Q3 规划」" },
	{ icon: MessageSquare, label: "最近的对话" },
	{ icon: Globe, label: "打开的网页" },
	{ icon: ClipboardList, label: "剪贴板" },
	{ icon: FileText, label: "项目文件" },
	{ icon: BookMarked, label: "人名与专有名词" },
	{ icon: Sparkles, label: "你的表达习惯" },
] as const;

const contextResultText = "Alex，《北落师门》方案今天定稿，晚点发你终版。";

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

const contextPhaseTimes = [1500, 1950, 2450] as const;

function ContextDemo() {
	const reduce = Boolean(useReducedMotion());
	const ref = useRef<HTMLDivElement | null>(null);
	const inView = useInView(ref, { once: true, amount: 0.4 });
	const phase = usePhases(inView, contextPhaseTimes, reduce);
	const typed = useTypewriter(contextResultText, phase >= 3, reduce);
	const typingDone = typed.length >= contextResultText.length;

	return (
		<div className="zg-demo-card" ref={ref}>
			<div className="zg-context-chips" aria-label="知更读取的 Context 来源">
				{contextChips.map((chip, i) => (
					<motion.span
						key={chip.label}
						initial={{ opacity: 0, y: 12 }}
						animate={inView || reduce ? { opacity: 1, y: 0 } : {}}
						transition={{ delay: 0.16 * i, duration: 0.4 }}
					>
						{"logo" in chip ? <img src={chip.logo} alt="" width={14} height={14} /> : <chip.icon size={14} />}
						{chip.label}
					</motion.span>
				))}
			</div>
			{phase >= 1 && phase < 3 && (
				<motion.div
					className="zg-context-processing"
					initial={{ opacity: 0, y: 8 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0 }}
					transition={{ duration: 0.35 }}
				>
					<Sparkles size={14} />
					正在结合 Context 改写…
				</motion.div>
			)}
			{(phase >= 2 || reduce) && (
				<motion.div
					className="zg-context-result"
					initial={{ opacity: 0, y: 14 }}
					animate={{ opacity: 1, y: 0 }}
					transition={{ duration: 0.4 }}
				>
					<motion.p
						className="zg-context-line zg-context-line-raw"
						initial={{ opacity: 0 }}
						animate={phase >= 2 ? { opacity: 1 } : {}}
						transition={{ duration: 0.35 }}
					>
						<span>你说</span>“跟 alex 说 beiluo 方案今天定稿”
					</motion.p>
					<p className="zg-context-line">
						<span>知更写</span>
						{phase >= 3 ? typed : ""}
						{phase >= 3 && !typingDone && <i className="zg-typewriter-cursor" aria-hidden="true" />}
					</p>
					<motion.p
						className="zg-demo-footnote"
						initial={{ opacity: 0 }}
						animate={typingDone ? { opacity: 1 } : {}}
						transition={{ duration: 0.35 }}
					>
						项目叫什么、人名怎么拼、你习惯什么语气 —— 都不用再解释一遍。
					</motion.p>
				</motion.div>
			)}
			<motion.p
				className="zg-privacy"
				initial={{ opacity: 0 }}
				animate={typingDone ? { opacity: 1 } : {}}
				transition={{ delay: 0.3, duration: 0.4 }}
			>
				<Lock size={13} />
				Context 留在你的 Mac 上，每一项来源都可以单独关闭。
			</motion.p>
		</div>
	);
}

/* ── 03 智能代回 ─────────────────────────────── */

const replyScenarios = [
	{
		id: "feishu",
		app: "飞书",
		logo: "/brand/icons/feishu.svg",
		from: "老板",
		incoming: "明天下午的评审能提前到上午吗？另外数据报告好了没？",
		intent: "答应他，报告今晚给",
		reply: "可以的，评审提前到明天上午没问题。数据报告我今晚整理好发您。",
	},
	{
		id: "gmail",
		app: "Gmail",
		logo: "/brand/icons/gmail.svg",
		from: "Sarah",
		incoming: "Hi — could you share the updated deck before Thursday's sync?",
		intent: "说周三之前给她",
		reply: "Hi Sarah, sure — I'll send the updated deck by Wednesday EOD so you have time to review before the sync.",
	},
	{
		id: "slack",
		app: "Slack",
		logo: "/brand/icons/slack.svg",
		from: "#eng",
		incoming: "any update on the api migration?",
		intent: "说测试环境已经跑通了",
		reply: "Yep — migration is live on staging and final checks are running. Should be good to ship tomorrow.",
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
	const [active, setActive] = useState<(typeof replyScenarios)[number]>(replyScenarios[0]);

	return (
		<div className="zg-demo-card" ref={ref}>
			<div className="zg-reply-tabs" role="tablist" aria-label="切换代回场景">
				{replyScenarios.map((scenario) => (
					<button
						key={scenario.id}
						type="button"
						role="tab"
						aria-selected={scenario.id === active.id}
						className={scenario.id === active.id ? "is-active" : ""}
						onClick={() => setActive(scenario)}
					>
						<img src={scenario.logo} alt="" width={16} height={16} />
						{scenario.app}
					</button>
				))}
			</div>
			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={active.id}
					className="zg-reply-flow"
					initial={reduce ? false : "hidden"}
					animate={inView || reduce ? "visible" : "hidden"}
					exit={{ opacity: 0, y: -8, transition: { duration: 0.18 } }}
				>
					<motion.div className="zg-bubble zg-bubble-in" variants={replyStep(0)}>
						<span>{active.from}</span>
						{active.incoming}
					</motion.div>
					<motion.div className="zg-reply-hint" variants={replyStep(0.45)}>
						<Command size={13} />
						长按右 ⌘，随口说
						<em>
							<Mic size={12} />
							“{active.intent}”
						</em>
					</motion.div>
					<motion.div className="zg-bubble zg-bubble-draft" variants={replyStep(0.95)}>
						<span>知更起草 · 像你写的</span>
						{active.reply}
						<motion.i className="zg-done-badge" variants={replyStep(1.5)}>
							<Check size={13} />
							已插入输入框
						</motion.i>
					</motion.div>
				</motion.div>
			</AnimatePresence>
			<p className="zg-demo-footnote">中文工作区回中文，英文工作区回英文，语气都照你的来。</p>
		</div>
	);
}

/* ── 04 Agent 执行 ─────────────────────────────── */

const agentSteps = [
	{ icon: FileText, label: "读取 报价单.pdf", meta: "12 页 · 提取 6 组报价" },
	{ icon: Table2, label: "整理成对比表格", meta: "供应商 × 价格 × 交期" },
	{ icon: Mail, label: "发邮件给采购部", meta: "附上表格 · 抄送你" },
	{ icon: Calendar, label: "创建周四 14:00 对齐会", meta: "拉上采购与项目组" },
	{ icon: History, label: "保存任务记录", meta: "随时可回看、可撤销" },
];

const agentPhaseTimes = [600, 1450, 2300, 3150, 4000, 4700] as const;

function AgentSection() {
	const reduce = Boolean(useReducedMotion());
	const ref = useRef<HTMLDivElement | null>(null);
	const inView = useInView(ref, { once: true, amount: 0.35 });
	const phase = usePhases(inView, agentPhaseTimes, reduce);

	return (
		<motion.section
			className="zg-agent"
			id="agent"
			aria-label="Agent 执行"
			initial={reduce ? false : "hidden"}
			whileInView="visible"
			viewport={{ once: true, amount: 0.2 }}
			variants={fadeUp}
		>
			<div className="zg-agent-head">
				<span className="zg-feature-index">04 · Agent 执行</span>
				<RevealHeading text="从一句话，到事情完成" />
				<p>这是知更和普通语音输入最大的差别：它不止把话写下来，还把事办掉。</p>
			</div>
			<div ref={ref}>
				<div className="zg-agent-command">
					<Mic size={18} />
					<p>“把这份 PDF 里的报价整理成表格，发邮件给采购，再约个周四下午的对齐会。”</p>
				</div>
				<ol className="zg-agent-steps">
					{agentSteps.map((step, i) => {
						const status = i < phase ? "is-done" : i === phase ? "is-active" : "";
						return (
							<li key={step.label} className={status}>
								<step.icon size={18} aria-hidden="true" />
								<div>
									<strong>{step.label}</strong>
									<small>{step.meta}</small>
								</div>
								<span className="zg-step-status" aria-hidden="true">
									{i < phase ? <Check size={15} /> : i === phase ? <i className="zg-step-dot" /> : null}
								</span>
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
					全部完成 · 任务已存档
				</motion.p>
			</div>
			<p className="zg-agent-tools">消息 · 邮件 · 日程 · 文件与 PDF · 浏览器 · Office · 本地 Agent</p>
		</motion.section>
	);
}

/* ── 05 记忆与主动协助 ─────────────────────────────── */

const profileItems = [
	{ label: "从 ChatGPT 导入的个人画像", meta: "一次导入，第一天就懂你", highlight: true },
	{ label: "项目 · 北落师门 / Q3 规划", meta: "自动学会，不用建词库" },
	{ label: "人物 · Alex（设计）· 王姐（采购）", meta: "知道谁是谁，称呼不出错" },
	{ label: "习惯 · 短句 · 先结论 · 不用感叹号", meta: "越用越像你写的" },
];

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
				lead="它记住的不是数据，是你做事的方式。所有记忆都存在本地，属于你。"
			/>
			<motion.div
				className="zg-memory-grid"
				initial={reduce ? false : "hidden"}
				whileInView="visible"
				viewport={{ once: true, amount: 0.3 }}
			>
				<div className="zg-demo-card zg-memory-profile">
					<span className="zg-demo-chip">你的知更画像</span>
					<ul>
						{profileItems.map((item, i) => (
							<motion.li
								key={item.label}
								className={item.highlight ? "is-highlight" : ""}
								variants={memoryItem(0.15 + 0.2 * i)}
							>
								<strong>{item.label}</strong>
								<small>{item.meta}</small>
							</motion.li>
						))}
					</ul>
				</div>
				<div className="zg-memory-side">
					<motion.div className="zg-demo-card zg-memory-card" variants={memoryItem(1.1)}>
						<span className="zg-memory-tag">
							<Sparkles size={13} />
							知更注意到了
						</span>
						<p>你刚复制了周四的航班信息，要把行程加进日历吗？</p>
						<div className="zg-memory-actions">
							<b>加入日历</b>
							<i>先不用</i>
						</div>
					</motion.div>
					<motion.div className="zg-demo-card zg-memory-card" variants={memoryItem(1.45)}>
						<span className="zg-memory-tag">
							<RotateCcw size={13} />
							复制找回
						</span>
						<p>两小时前复制的收货地址被覆盖了 —— 知更帮你留着，点一下拿回来。</p>
					</motion.div>
				</div>
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
					points={[
						"自动去掉「嗯、呃、那个」",
						"识别改口，只保留最终意思",
						"语序和结构自动理顺",
						"进飞书、邮件、文档时，格式各就各位",
					]}
				/>
				<div className="zg-feature-demo">
					<SpeakDemo />
				</div>
			</section>

			<section className="zg-feature zg-feature-panel zg-feature--soft zg-feature--flip" id="context" aria-label="Context 感知">
				<FeatureCopy
					index="02 · Context"
					title="它知道你正在做什么"
					lead="同一句话，在不同窗口里该写成不同的样子。知更看得到你的当下，所以写得准。"
					points={[
						"当前应用与窗口",
						"最近的对话、网页和文件",
						"剪贴板内容",
						"项目、人物与专有名词",
						"长期表达习惯",
					]}
				/>
				<div className="zg-feature-demo">
					<ContextDemo />
				</div>
			</section>

			<section className="zg-feature" id="reply" aria-label="智能代回">
				<FeatureCopy
					index="03 · 智能代回"
					title="不用组织语言，也能回得像你"
					lead="消息堆着不想回的时候，说一句大概意思，剩下的交给它。"
					points={[
						"读取当前消息，理解对方在问什么",
						"按你的语气和习惯起草",
						"中英文工作区自动适配",
						"直接插入输入框，看一眼就能发",
					]}
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
