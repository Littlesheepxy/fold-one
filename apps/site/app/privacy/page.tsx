import type { Metadata } from "next";
import { Eye, HardDrive, ShieldCheck, SlidersHorizontal, Trash2 } from "lucide-react";
import { PageIntro } from "../components/PageSections";

export const metadata: Metadata = {
	title: "隐私",
	description: "知更如何处理本地工作信息：本地存储、必要调用、不经服务器落盘，以及模型不用于训练。",
	alternates: { canonical: "/privacy" },
};

const principles = [
	{
		icon: HardDrive,
		title: "只存在你的 Mac 上",
		body: "窗口、对话、网页、剪贴板与文件线索，用来帮助知更理解你正在做什么。这些 Context 默认留在本地，不会变成我们云端里的档案。",
	},
	{
		icon: ShieldCheck,
		title: "只在必要时使用，直达所选 AI",
		body: "真正调用模型时，只发送完成当前指令所需的片段。请求直达你选择的 AI 服务，不经我们的服务器落盘或二次存储。",
	},
	{
		icon: Eye,
		title: "不用于训练",
		body: "我们选择并默认启用遵循「不用于模型训练」原则的服务与配置。你的工作内容不该变成别人的训练数据。",
	},
	{
		icon: SlidersHorizontal,
		title: "每一项都可以关闭",
		body: "不希望读取某类窗口、对话、网页或剪贴板时，可以单独关闭，不必在便利与隐私之间二选一。",
	},
	{
		icon: Trash2,
		title: "记忆属于你",
		body: "表达习惯、人物、项目和任务记录都可以查看、修改与删除。工具越懂你，控制权越要清楚。",
	},
];

export default function PrivacyPage() {
	return (
		<main className="zg-subpage">
			<PageIntro eyebrow="隐私" title="懂你的前提，是尊重你的边界。">
				<p>
					知更需要理解当下，但不意味着它可以不加解释地读取一切。我们把本地优先、必要调用、不落盘与不训练，写进产品设计。
				</p>
			</PageIntro>

			<section className="zg-privacy-hero" aria-label="隐私设计原则">
				<div className="zg-privacy-orb" aria-hidden="true" />
				<p>
					你的工作方式
					<br />
					属于你
				</p>
			</section>

			<section className="zg-principles">
				{principles.map((principle) => (
					<article key={principle.title}>
						<principle.icon size={20} />
						<h2>{principle.title}</h2>
						<p>{principle.body}</p>
					</article>
				))}
			</section>

			<section className="zg-plain-note">
				<span>一句话说明</span>
				<h2>
					Context 留在本地；调用时只传必要片段，直达所选 AI，不经我们的服务器落盘；所选模型遵循不用于训练的原则。
				</h2>
				<p>具体数据清单与服务边界会随内测版本持续更新，并在产品内提供对应开关。</p>
			</section>
		</main>
	);
}
