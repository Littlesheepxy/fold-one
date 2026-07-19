import type { Metadata } from "next";
import { PageCta, PageIntro } from "../components/PageSections";

export const metadata: Metadata = {
	title: "关于知更",
	description: "为什么做知更：让电脑听懂你正在做什么，也把接下来的事情真正做完。",
	alternates: { canonical: "/about" },
};

const beliefs = [
	{
		index: "01",
		title: "先懂当下，再写下文字",
		body: "同一句话，在项目群、邮件和文档里，本来就不该写成同一个样子。语音输入不应只听见声音，也应该知道你此刻在做什么。",
	},
	{
		index: "02",
		title: "简单的事直接做，复杂的事交给你熟悉的 Agent",
		body: "消息、日程和整理等简单事项由知更完成；代码与复杂工作，则快速接上本地 Codex、Claude Code 或 WorkBuddy，而不是再造一个新的 Agent。",
	},
	{
		index: "03",
		title: "越懂你，越要由你控制",
		body: "人物、项目、表达习惯和任务记录构成了你的工作方式。它们应该留在本地，随时可见、可关闭、可删除。",
	},
];

export default function AboutPage() {
	return (
		<main className="zg-subpage">
			<PageIntro eyebrow="关于知更" title="我们没有发明语音输入，只是觉得它还可以更懂你。">
				<p>“知更”不是更会说话，而是更知道你想表达什么、接下来想完成什么。</p>
			</PageIntro>

			<section className="zg-origin">
				<div className="zg-origin-mark" aria-hidden="true">
					<img src="/zhigeng-mark.png" alt="" width={160} height={160} />
				</div>
				<div>
					<span>名字与标识</span>
					<h2>知你所言，才更懂你意。</h2>
					<p>
						<strong>知更</strong>
						：知你所言，才更懂你意。我们想做的不是另一个需要你学习如何提问的工具，而是一个能进入日常工作、安静理解上下文，并在需要时往前多走一步的伙伴。
					</p>
					<p>
						<strong>标识</strong>
						：一只知更鸟，藏进对话气泡里——圆身是气泡，尾尖是气泡角。对话是入口，理解是鸟鸣：听懂你说的，也读懂你正处在什么情境。
					</p>
				</div>
			</section>

			<section className="zg-beliefs">
				{beliefs.map((belief) => (
					<article key={belief.index}>
						<span>{belief.index}</span>
						<h2>{belief.title}</h2>
						<p>{belief.body}</p>
					</article>
				))}
			</section>

			<PageCta title="让电脑少要求你解释，多替你理解一步。" />
		</main>
	);
}
