import type { Metadata } from "next";
import { PageIntro } from "../components/PageSections";
import { BetaApplyForm } from "../components/BetaApplyForm";

export const metadata: Metadata = {
	title: "申请内测码",
	description: "申请知更 macOS 内测码。分批发放，通过后将发送下载与安装说明。",
	alternates: { canonical: "/beta" },
};

export default function BetaPage() {
	return (
		<main className="zg-subpage">
			<PageIntro eyebrow="内测" title="申请内测码">
				<p>
					知更正在分批开放 macOS 内测。填写下方信息后，我们会按顺序审核；通过后将把内测码与安装方式发到你的邮箱。
				</p>
			</PageIntro>

			<section className="zg-beta-layout" aria-label="申请表单">
				<div className="zg-beta-aside">
					<h2>内测阶段你可以体验</h2>
					<ul>
						<li>语音整理：改口、口头语清理后直接插入</li>
						<li>情境代回：读当前对话，多草案选一条插入</li>
						<li>不抢焦点：Menu Bar + Overlay，不必开聊天窗</li>
						<li>本地记忆：习惯与跟进事项留在你的 Mac</li>
						<li>外发前确认：敏感操作可取消，无副作用</li>
					</ul>
					<p>
						需要 Apple Silicon Mac。部分语音与生成能力需联网；工作上下文默认本地存储，详见隐私政策。
					</p>
				</div>
				<BetaApplyForm />
			</section>
		</main>
	);
}
