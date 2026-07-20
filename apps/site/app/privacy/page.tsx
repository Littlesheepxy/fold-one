import type { Metadata } from "next";
import Link from "next/link";
import { LegalDoc, LegalSection } from "../components/LegalDoc";

export const metadata: Metadata = {
	title: "隐私政策",
	description:
		"知更如何收集、使用、存储与保护你的信息：本地优先、必要调用、第三方 AI 边界、你的权利与选择。",
	alternates: { canonical: "/privacy" },
};

/**
 * 结构参考 Apple Privacy Policy、Granola Privacy Policy、Raycast Privacy Policy 的常见章节：
 * 范围 → 收集清单 → 使用目的 → 存储与传输 → 第三方 → 权利 → 儿童 → 变更 → 联系。
 * 内容按知更（macOS 本地优先 Agent）真实产品行为撰写；不构成律师意见。
 */
export default function PrivacyPage() {
	return (
		<LegalDoc
			eyebrow="隐私政策"
			title="隐私政策"
			updatedAt="2026 年 7 月 18 日"
			summary={
				<>
					<p>
						知更（zhigeng.app，下称「我们」）提供面向 macOS 的语音输入、情境理解、代写代回与本地执行辅助。你把工作上下文交给工具时，我们希望像 Apple、Granola 等重视隐私的产品一样：说清楚收集什么、为何需要、存在哪里、谁能接触、以及你如何控制。
					</p>
					<p>
						使用知更网站、申请内测、安装或使用知更客户端，即表示你已阅读本政策。若你不同意，请停止使用相关服务。更完整的使用条件见{" "}
						<Link href="/terms">《用户协议》</Link>。
					</p>
				</>
			}
		>
			<nav className="zg-legal-toc" aria-label="本页目录">
				<a href="#summary">要点摘要</a>
				<a href="#scope">适用范围</a>
				<a href="#collect">我们收集的信息</a>
				<a href="#use">我们如何使用</a>
				<a href="#local">本地优先与出网边界</a>
				<a href="#share">共享与第三方</a>
				<a href="#retain">保存与删除</a>
				<a href="#rights">你的权利</a>
				<a href="#security">安全措施</a>
				<a href="#children">儿童</a>
				<a href="#intl">跨境与地区</a>
				<a href="#changes">政策更新</a>
				<a href="#contact">联系我们</a>
			</nav>

			<LegalSection id="summary" title="1. 要点摘要">
				<ul>
					<li>
						<strong>工作上下文默认留在你的 Mac。</strong>
						窗口、对话片段、网页、剪贴板、文件线索与个人记忆，用于帮助知更理解当下；默认保存在本机数据目录（如{" "}
						<code>~/.zhigeng</code>），不会变成我们云端里的「全量档案」。
					</li>
					<li>
						<strong>调用模型时只传必要片段。</strong>
						语音净化、代回草案、情境猜测等需要云端模型时，请求直达你选择或我们配置的 AI 服务提供方；我们不以建设「训练语料库」为目的存储这些内容。
					</li>
					<li>
						<strong>不用于训练我们自己的模型。</strong>
						我们不会把你的个人工作内容用于训练知更自有基础模型。第三方 AI 提供方是否用于训练，以其当时有效的条款与我们选用的配置为准；我们默认选择声明不用于训练或提供关闭训练选项的服务配置，并会在产品内尽量标明。
					</li>
					<li>
						<strong>你可以关闭来源、查看与删除记忆。</strong>
						不希望读取某类窗口、对话、网页或剪贴板时，可在设置中单独关闭；表达习惯、人物与项目记忆可查看、修改与删除。
					</li>
					<li>
						<strong>申请内测会收集联系信息。</strong>
						申请内测码时，我们会处理你提交的邮箱等信息，仅用于审核资格、发送内测码与安装说明、以及必要的产品沟通。
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="scope" title="2. 适用范围">
				<p>本政策适用于：</p>
				<ul>
					<li>知更官方网站（含博客、定价、内测申请等页面）；</li>
					<li>知更 macOS 客户端及其相关本地组件；</li>
					<li>与账号、内测资格、权益同步相关的服务（若你选择登录或同步）。</li>
				</ul>
				<p>
					本政策不适用于你自行选择连接的第三方服务（例如本机安装的 Claude Code、Codex、飞书、Chrome
					等）——那些服务受其自身隐私政策约束。知更在本地调用它们时，请同时阅读对方条款。
				</p>
			</LegalSection>

			<LegalSection id="collect" title="3. 我们收集的信息">
				<p>
					我们只收集提供服务所合理需要的信息。下表说明常见类别（结构参考业界隐私政策中的「信息类别清单」写法）：
				</p>
				<div className="zg-legal-table-wrap">
					<table className="zg-legal-table">
						<thead>
							<tr>
								<th>类别</th>
								<th>示例</th>
								<th>主要来源</th>
								<th>默认存放</th>
							</tr>
						</thead>
						<tbody>
							<tr>
								<td>账号与联系信息</td>
								<td>邮箱、验证码登录相关信息、显示名称（如有）</td>
								<td>你主动提交 / 登录</td>
								<td>账号服务（若启用）</td>
							</tr>
							<tr>
								<td>内测申请信息</td>
								<td>邮箱、称呼、使用场景、设备信息（如 macOS 版本）</td>
								<td>内测申请表</td>
								<td>运营侧处理渠道</td>
							</tr>
							<tr>
								<td>设备与诊断信息</td>
								<td>应用版本、崩溃或错误摘要、性能指标（若开启）</td>
								<td>客户端自动采集（有限）</td>
								<td>本机；未来可能经你同意上报</td>
							</tr>
							<tr>
								<td>工作上下文（Context）</td>
								<td>前台应用名、窗口标题、近期网页 URL、剪贴板文本片段、可见文本/OCR 片段、焦点停留</td>
								<td>系统权限授权后由本机采集</td>
								<td>
									<strong>本机为主</strong>
								</td>
							</tr>
							<tr>
								<td>语音相关数据</td>
								<td>麦克风音频流、转写文本、结构化后的文本</td>
								<td>你发起语音输入时</td>
								<td>音频通常不长期保存；文本可进入本机记录</td>
							</tr>
							<tr>
								<td>任务与记忆</td>
								<td>任务意图摘要、执行步骤结果、人物/项目/习惯记忆、语音交互记录</td>
								<td>使用过程中生成</td>
								<td>
									<strong>本机为主</strong>
								</td>
							</tr>
							<tr>
								<td>网站使用数据</td>
								<td>访问页面、来源、基本设备/浏览器信息</td>
								<td>浏览网站时</td>
								<td>托管方日志（有限、短期）</td>
							</tr>
							<tr>
								<td>支付与权益（若开通）</td>
								<td>订阅状态、体验额度消耗；支付卡号由支付服务商处理</td>
								<td>你购买或兑换权益时</td>
								<td>支付服务商 + 权益记录</td>
							</tr>
						</tbody>
					</table>
				</div>
				<p>
					<strong>我们不会故意收集</strong>
					：政府身份证号、完整银行卡号、生物识别模板用于识别身份等敏感信息作为产品功能所需字段。若你在语音或剪贴板中主动说出/复制此类信息，请谨慎；知更会按普通文本处理上下文，建议避免在语音指令中朗读密码或密钥。
				</p>
			</LegalSection>

			<LegalSection id="use" title="4. 我们如何使用信息">
				<p>我们使用上述信息，目的包括：</p>
				<ul>
					<li>
						<strong>提供核心功能：</strong>
						语音转写与净化、按当前应用整理格式、情境代回、主动建议、本地任务执行与 Agent 交接；
					</li>
					<li>
						<strong>改善可靠性：</strong>
						理解失败原因、修复缺陷、评估延迟与准确率（优先使用聚合或本机诊断）；
					</li>
					<li>
						<strong>账号与权益：</strong>
						验证登录、同步你选择同步的权益状态、防止滥用；
					</li>
					<li>
						<strong>内测运营：</strong>
						审核与发送内测码、告知安装方式与重要变更、收集自愿反馈；
					</li>
					<li>
						<strong>安全与合规：</strong>
						检测滥用、遵守适用法律、回应合法请求。
					</li>
				</ul>
				<p>我们不会出售你的个人信息。</p>
			</LegalSection>

			<LegalSection id="local" title="5. 本地优先与出网边界">
				<p>知更的设计原则是「先懂当下，但默认不把当下变成云端档案」：</p>
				<ul>
					<li>
						<strong>本地处理优先：</strong>
						情境采集、记忆存储、任务轨迹默认在本机完成。你可在系统设置中管理麦克风、辅助功能、屏幕录制等权限；未授权则对应能力不可用。
					</li>
					<li>
						<strong>出网场景：</strong>
						当你使用需要云端模型的能力（例如复杂语音净化、代回草案、部分主动猜测），知更会将完成该次请求所必要的文本（及在代回场景下可能的窗口截图/OCR 文本）发送至 AI 服务提供方。
					</li>
					<li>
						<strong>你控制的密钥（BYOK）：</strong>
						若你配置自己的 API Key，请求可按你的配置直达对应提供方；密钥保存在本机，请妥善保管。
					</li>
					<li>
						<strong>本地语音选项：</strong>
						在支持的配置下，你可使用本机语音识别路径以减少音频出网；具体可用性取决于版本与机型。
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="share" title="6. 共享与第三方服务">
				<p>我们可能在以下有限情形与第三方共享信息：</p>
				<ul>
					<li>
						<strong>AI 推理提供方：</strong>
						为完成你发起的生成/转写请求，向模型服务发送必要内容。提供方可能包括你或我们配置的云服务（例如兼容 OpenAI API
						的服务商）。请阅读其隐私政策与数据处理条款。
					</li>
					<li>
						<strong>基础设施与邮件：</strong>
						网站托管、邮件发送（内测码/验证码）、错误监控等服务商，仅在提供该服务所必需的范围内处理数据。
					</li>
					<li>
						<strong>支付处理方：</strong>
						若上线付费，卡数据由支付服务商（如 Stripe 等）直接处理，我们通常只保存权益状态而非完整卡号。
					</li>
					<li>
						<strong>法律要求：</strong>
						在法律强制、保护用户或公共安全所必需时，可能披露信息。
					</li>
					<li>
						<strong>你授权的本地 Agent / 办公软件：</strong>
						当你允许知更调用本机 Claude Code、Codex、飞书等时，相关内容按你的指示进入这些工具的处理范围。
					</li>
				</ul>
				<p>
					除上述情形外，我们不会向广告网络出售你的工作上下文用于定向广告。
				</p>
			</LegalSection>

			<LegalSection id="retain" title="7. 保存期限与删除">
				<ul>
					<li>
						<strong>本机数据：</strong>
						在你卸载应用或手动清除数据目录前，本地 Context、记忆与任务记录通常会保留以便「越用越懂你」。你可在产品内删除记忆条目；亦可删除本机数据目录以清除本地库（操作不可恢复，请谨慎）。
					</li>
					<li>
						<strong>账号数据：</strong>
						若你创建账号，可在客户端申请删除账号；删除后我们将在合理期限内删除或匿名化服务端保存的账号相关信息，法律要求保留的除外。
					</li>
					<li>
						<strong>内测申请：</strong>
						用于发送内测码与沟通的联系信息，在内测周期结束后或你要求删除时停止用于营销沟通；技术日志可能短期保留。
					</li>
					<li>
						<strong>音频：</strong>
						语音功能以完成转写为目的处理音频流；我们不以「长期云端录音库」的方式保存你的语音原文。本机是否缓存临时文件取决于系统与版本实现，会尽量短生命周期处理。
					</li>
				</ul>
			</LegalSection>

			<LegalSection id="rights" title="8. 你的权利与选择">
				<p>视你所在地区适用法律，你可能享有访问、更正、删除、限制处理、撤回同意、投诉等权利。对知更而言，你至少可以：</p>
				<ul>
					<li>在系统设置中撤销麦克风、辅助功能、屏幕录制等权限；</li>
					<li>在应用设置中关闭特定 Context 来源；</li>
					<li>查看、编辑或删除本地记忆与相关记录；</li>
					<li>删除账号（若已登录）或停止使用并清除本机数据目录；</li>
					<li>就内测邮件沟通回复退订或要求删除申请信息。</li>
				</ul>
				<p>
					行使权利请联系 <a href="mailto:hello@zhigeng.app">hello@zhigeng.app</a>
					。我们将在合理期限内核实身份并处理。
				</p>
			</LegalSection>

			<LegalSection id="security" title="9. 安全措施">
				<p>
					我们采取与业务风险相称的技术与管理措施，例如本机数据目录权限控制、传输层加密（HTTPS）、最小必要出网、敏感操作前的确认（HITL）等。但任何系统都无法保证绝对安全；请使用系统锁屏、及时更新 macOS
					与知更版本，并避免在不可信设备上登录。
				</p>
			</LegalSection>

			<LegalSection id="children" title="10. 儿童隐私">
				<p>
					知更面向成年人的工作效率场景，不面向 14
					周岁以下儿童提供服务。我们不会故意收集儿童的个人信息。若你认为我们误收集了儿童信息，请联系我们，我们将尽快删除。
				</p>
			</LegalSection>

			<LegalSection id="intl" title="11. 跨境传输与地区说明">
				<p>
					知更由中国团队运营官网与产品沟通。当你使用位于其他国家/地区的 AI
					或云服务提供方时，相关数据可能依据该提供方的条款被传输至其服务器所在地。请确认你在使用云端能力时遵守所在地的数据保护与出口管制要求。若后续提供企业版数据处理协议（DPA）或区域部署选项，我们将另行说明。
				</p>
			</LegalSection>

			<LegalSection id="changes" title="12. 政策更新">
				<p>
					我们可能随产品能力更新本政策（例如新增崩溃上报、账号同步或支付）。重大变更会在网站公布更新日期，并在合适时通过应用内或邮件提示。若更新后你继续使用服务，即视为接受更新后的政策；若你不同意，请停止使用并删除本机数据。
				</p>
			</LegalSection>

			<LegalSection id="contact" title="13. 联系我们">
				<p>
					隐私相关问题、行使权利或投诉，请邮件联系：{" "}
					<a href="mailto:hello@zhigeng.app">hello@zhigeng.app</a>
				</p>
				<p>
					同时请阅读 <Link href="/terms">《用户协议》</Link>{" "}
					与内测说明。本政策旨在透明说明产品实践，不构成法律意见；如需合规审计材料，请通过上述邮箱联系。
				</p>
			</LegalSection>
		</LegalDoc>
	);
}
