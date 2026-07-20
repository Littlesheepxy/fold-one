import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, LegalSection } from "../components/LegalDoc";

export const metadata: Metadata = {
	title: "用户协议",
	description: "知更 macOS 服务与内测的使用条款：许可、可接受使用、AI 免责、责任限制与终止。",
	alternates: { canonical: "/terms" },
};

/**
 * 结构参考 Apple 软件许可、Raycast Terms、常见 SaaS ToS：
 * 接受 → 服务描述 → 账户 → 许可 → 可接受使用 → AI/结果 → 内测 → 第三方 → 免责 → 责任限制 → 终止 → 法律适用。
 */
export default function TermsPage() {
	return (
		<LegalDoc
			eyebrow="用户协议"
			title="用户协议"
			updatedAt="2026 年 7 月 18 日"
			summary={
				<>
					<p>
						欢迎使用知更（zhigeng.app）。本《用户协议》（下称「本协议」）是你与知更运营方之间关于使用知更网站、macOS
						客户端、内测计划及相关服务（合称「服务」）的法律协议。请在安装、申请内测码或使用服务前仔细阅读。
					</p>
					<p>
						点击同意、申请内测、安装或使用服务，即表示你已阅读并同意受本协议及{" "}
						<Link href="/privacy">《隐私政策》</Link> 约束。若你代表组织使用，你声明有权使该组织受本协议约束。
					</p>
				</>
			}
		>
			<nav className="zg-legal-toc" aria-label="本页目录">
				<a href="#accept">接受条款</a>
				<a href="#service">服务说明</a>
				<a href="#beta">内测特别条款</a>
				<a href="#account">账号与内测码</a>
				<a href="#license">软件许可</a>
				<a href="#acceptable">可接受使用</a>
				<a href="#ai">AI 生成与执行</a>
				<a href="#third">第三方与本机权限</a>
				<a href="#ip">知识产权</a>
				<a href="#disclaimer">免责声明</a>
				<a href="#liability">责任限制</a>
				<a href="#terminate">暂停与终止</a>
				<a href="#law">适用法律</a>
				<a href="#contact">联系</a>
			</nav>

			<LegalSection id="accept" title="1. 接受条款">
				<p>
					你必须年满 18
					周岁（或你所在地成年人年龄），并具备完全民事行为能力。若你不同意本协议任一条款，请勿下载、安装或使用服务。
				</p>
			</LegalSection>

			<LegalSection id="service" title="2. 服务说明">
				<p>知更是一款面向 macOS 的个人效率软件，主要能力包括但不限于：</p>
				<ul>
					<li>语音输入整理（清理口头语、改口，并按目标应用格式插入）；</li>
					<li>基于本机上下文的情境理解与代写、代回建议；</li>
					<li>在授权后执行简单操作，或将复杂任务交接给你本机已安装的编码 Agent；</li>
					<li>在本机保存的个人记忆与习惯沉淀。</li>
				</ul>
				<p>
					服务可能随版本增加、调整或下线功能。我们会尽量通过更新说明告知重大变更，但不保证任一功能永久可用。部分能力依赖网络、第三方模型或你本机安装的其他软件。
				</p>
			</LegalSection>

			<LegalSection id="beta" title="3. 内测特别条款">
				<p>在公开正式版之前，服务可能以「内测」「邀请制」或「预览」形式提供。内测阶段额外适用：</p>
				<ul>
					<li>
						<strong>资格：</strong>
						内测码仅供被邀请的个人使用，不得出售、转让或公开分享安装包（除非我们书面允许）；
					</li>
					<li>
						<strong>不稳定性：</strong>
						内测软件可能包含缺陷、数据丢失风险、性能问题或与后续正式版不兼容的变更；
					</li>
					<li>
						<strong>反馈：</strong>
						你理解我们可能收集你自愿提供的反馈；反馈不构成你对知更主张知识产权的基础，我们可免费使用反馈改进产品；
					</li>
					<li>
						<strong>无服务等级承诺：</strong>
						内测不提供 SLA、不保证可用性或支持响应时间；
					</li>
					<li>
						<strong>随时调整：</strong>
						我们可随时暂停、结束内测或收回内测资格，而无需事先通知（法律要求除外）。
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="account" title="4. 账号、内测码与安全">
				<ul>
					<li>申请内测时请提供真实、有效的联系邮箱，以便接收内测码与安全通知。</li>
					<li>你应妥善保管内测码、验证码与本机 API Key；因保管不善导致的损失由你自行承担。</li>
					<li>发现未经授权使用时，请立即通知我们并修改相关凭证。</li>
					<li>一人一码为默认原则；我们发现滥用（批量注册、倒卖、攻击服务）时可取消资格。</li>
				</ul>
			</LegalSection>

			<LegalSection id="license" title="5. 软件许可">
				<p>
					在你遵守本协议的前提下，我们授予你一项个人的、非独家的、不可转让的、可撤销的有限许可，仅用于在你拥有或控制的
					Apple Silicon / 兼容 macOS 设备上安装和使用知更客户端。你不得：
				</p>
				<ul>
					<li>对客户端进行反向工程、反编译或试图提取源代码（法律强制允许的除外）；</li>
					<li>出租、出售、再许可或以服务形式向第三方提供客户端拷贝；</li>
					<li>绕过技术保护措施、用量限制或安全机制；</li>
					<li>移除或篡改专有权声明。</li>
				</ul>
				<p>除本协议明示授予外，所有权利由我们保留。</p>
			</LegalSection>

			<LegalSection id="acceptable" title="6. 可接受使用">
				<p>你同意不会将服务用于：</p>
				<ul>
					<li>违反任何适用法律、法规或第三方权利的行为；</li>
					<li>未经授权访问他人系统、数据、账号或通信；</li>
					<li>传播恶意软件、进行网络攻击或破坏服务稳定性；</li>
					<li>骚扰、欺诈、歧视或侵害他人合法权益；</li>
					<li>处理你无权处理的个人信息或机密信息（你应自行确保有合法基础）；</li>
					<li>利用服务生成或传播违法、侵权内容；</li>
					<li>干扰其他用户或我们的运营（含自动化滥用刷接口）。</li>
				</ul>
				<p>
					知更可能代表你操作本机应用或发送消息——你对最终发出的内容与执行的操作负全部责任。涉及对外发送、删除、支付或不可逆操作时，请认真阅读确认提示。
				</p>
			</LegalSection>

			<LegalSection id="ai" title="7. 人工智能生成内容与自动执行">
				<p>服务包含基于机器学习模型的生成与建议功能。你理解并同意：</p>
				<ul>
					<li>
						<strong>结果可能不准确：</strong>
						转写、代回、摘要、代码修改建议等可能含有错误、遗漏或「幻觉」内容，不构成专业法律、医疗、金融或投资建议；
					</li>
					<li>
						<strong>你必须审核：</strong>
						在发送消息、提交代码、执行脚本或依赖输出做决策前，应由你自行核实；
					</li>
					<li>
						<strong>执行有风险：</strong>
						将任务交给本地 Agent（如 Codex、Claude Code）可能导致文件被修改；请在合适的工作区使用，并保留版本控制；
					</li>
					<li>
						<strong>模型提供方条款：</strong>
						云端推理还受对应 AI 提供方条款约束；你配置 BYOK 时，费用与合规由你与该提供方结算。</li>
				</ul>
			</LegalSection>

			<LegalSection id="third" title="8. 第三方服务与系统权限">
				<p>
					服务可能请求 macOS 权限（麦克风、辅助功能、屏幕录制等），并连接你本机或网络上的第三方工具。第三方服务由第三方提供，我们不对其可用性、安全性或内容负责。你启用权限或连接即表示理解相关风险；可随时在系统设置中撤销权限。
				</p>
			</LegalSection>

			<LegalSection id="ip" title="9. 知识产权与用户内容">
				<ul>
					<li>
						知更的名称、标识、界面、软件与文档受知识产权法保护，归运营方或其许可方所有。
					</li>
					<li>
						你保留对输入内容及由你业务产生的数据的权利。为提供服务之目的，你授予我们在必要范围内处理这些内容的许可（例如完成本次代回请求）。
					</li>
					<li>
						你保证你有权提交相关内容，且内容不侵犯第三方权利。
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="disclaimer" title="10. 免责声明">
				<p>
					在适用法律允许的最大范围内，服务按「现状」和「可用」基础提供，不提供任何明示或默示担保，包括适销性、特定用途适用性、不侵权、无中断或无错误等。内测阶段尤其如此。
				</p>
			</LegalSection>

			<LegalSection id="liability" title="11. 责任限制">
				<p>
					在适用法律允许的最大范围内，我们对因使用或无法使用服务而导致的任何间接、附带、特殊、后果性或惩罚性损害（包括利润、数据、商誉损失）不承担责任，即便已被告知可能发生。我们对你承担的全部责任总额，不超过你在索赔前十二个月内就相关服务向我们实际支付的费用（若为免费内测，则为人民币一百元或法律允许的最低限额）。某些地区不允许限制责任，则上述限制在该地区在法律允许的范围内适用。
				</p>
			</LegalSection>

			<LegalSection id="terminate" title="12. 暂停与终止">
				<p>
					你可以随时停止使用并卸载客户端、删除本机数据。若你严重或反复违反本协议，或我们合理认为存在安全/法律风险，我们可暂停或终止你的访问（含收回内测码）。终止后，许可立即结束；本协议中依其性质应继续有效的条款（知识产权、免责、责任限制、法律适用等）继续有效。
				</p>
			</LegalSection>

			<LegalSection id="law" title="13. 适用法律与争议解决">
				<p>
					本协议适用中华人民共和国法律（不含冲突法）。因本协议产生的争议，双方应先行友好协商；协商不成的，提交知更运营方住所地有管辖权的人民法院诉讼解决。若你所在地强制性消费者保护法另有规定，从其规定。
				</p>
			</LegalSection>

			<LegalSection id="misc" title="14. 其他">
				<ul>
					<li>本协议构成双方就标的事项的完整协议，取代先前口头或书面谅解。</li>
					<li>我们未行使某项权利不构成放弃。</li>
					<li>若某条款被认定不可执行，其余条款继续有效。</li>
					<li>
						我们可能更新本协议；重大更新将公布更新日期。你继续使用即视为接受更新后的协议。
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="contact" title="15. 联系我们">
				<p>
					关于本协议：<a href="mailto:hello@zhigeng.app">hello@zhigeng.app</a>
				</p>
				<p>
					隐私问题请见 <Link href="/privacy">《隐私政策》</Link>；申请内测请前往{" "}
					<Link href="/beta">申请内测码</Link>。
				</p>
			</LegalSection>
		</LegalDoc>
	);
}
