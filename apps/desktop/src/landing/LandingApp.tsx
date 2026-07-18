import { ArrowRight, Check, Command, Mic, Sparkles } from "lucide-react";
import { PRODUCT_NAME, TAGLINE } from "../brand/constants";
import { ZhigengLogoMark } from "../components/ZhigengLogoMark";

const appTiles = ["微信", "飞书", "钉钉", "Chrome", "邮件"];

const voiceBars = [18, 30, 42, 56, 72, 88, 62, 46, 34, 24, 40, 54, 32];

export function LandingApp() {
	return (
		<main className="zg-page">
			<header className="zg-nav" aria-label="主导航">
				<a className="zg-brand" href="#top" aria-label="知更首页">
					<ZhigengLogoMark size={34} />
					<span>{PRODUCT_NAME}</span>
				</a>
				<nav className="zg-nav-links" aria-label="页面导航">
					<a href="#demo">演示</a>
					<a href="#scenarios">场景</a>
					<a href="#pricing">定价</a>
				</nav>
				<a className="zg-nav-cta" href="#download">
					申请内测码
				</a>
			</header>

			<section className="zg-hero" id="top">
				<div className="zg-hero-copy">
					<div className="zg-kicker">
						<Sparkles size={16} />
						<span>{TAGLINE}</span>
					</div>
					<h1>说一句，知更帮你写成刚好的样子。</h1>
					<p>
						面向中文工作流的语音输入助手。它理解上下文、记住你的表达习惯，把零散口述变成能直接发送、记录和执行的文字。
					</p>
					<div className="zg-actions" id="download">
						{/* 正式申请走 apps/site /beta；本页仅本地原型演示 */}
						<a className="zg-primary" href="#demo">
							查看演示
							<ArrowRight size={18} />
						</a>
						<a className="zg-secondary" href="#pricing">
							内测说明见下方
						</a>
					</div>
				</div>

				<section className="zg-demo" id="demo" aria-label="知更语音输入演示">
					<div className="zg-demo-topline">
						<div>
							<span className="zg-demo-label">普通输入</span>
							<strong>48</strong>
							<small>wpm</small>
						</div>
						<div className="zg-demo-better">
							<span className="zg-demo-label">知更语音</span>
							<strong>216</strong>
							<small>wpm</small>
						</div>
						<div>
							<span className="zg-demo-label">每周节省</span>
							<strong>6.5</strong>
							<small>小时</small>
						</div>
					</div>

					<div className="zg-workspace">
						<div className="zg-context-stack" aria-hidden="true">
							{appTiles.map((app) => (
								<span key={app}>{app}</span>
							))}
						</div>
						<div className="zg-compose">
							<div className="zg-compose-header">
								<div>
									<span>写给产品同事</span>
									<strong>飞书 · 项目群</strong>
								</div>
								<span className="zg-ready">
									<Check size={14} />
									已贴合上下文
								</span>
							</div>
							<p>
								我们今天先收敛到两个版本：一个强调语音速度，一个强调知更理解上下文。落地页保持干净，第一屏直接让用户看到“说完就能发”的结果。
							</p>
						</div>
						<div className="zg-voice-pill">
							<Mic size={18} />
							<div className="zg-bars" aria-hidden="true">
								{voiceBars.map((height, index) => (
									<span key={`${height}-${index}`} style={{ height }} />
								))}
							</div>
							<Command size={18} />
						</div>
					</div>
				</section>
			</section>

			<section className="zg-scenarios" id="scenarios" aria-label="使用场景">
				<article>
					<span>01</span>
					<h2>它知道你在哪个软件里说话</h2>
					<p>在群聊、邮件、浏览器和文档里，知更会根据当前窗口调整称呼、语气和格式。</p>
				</article>
				<article>
					<span>02</span>
					<h2>它把口语改成能直接用的文本</h2>
					<p>保留你的意思，自动补全结构、标点和重点，让输入不再停在草稿状态。</p>
				</article>
				<article>
					<span>03</span>
					<h2>它越用越像你的工作习惯</h2>
					<p>常用词、项目名称和表达偏好会沉淀成个人 Profile，减少反复修正。</p>
				</article>
			</section>

			<section className="zg-pricing" id="pricing" aria-label="定价">
				<div>
					<span>内测开放中</span>
					<h2>先给高频输入的人用起来。</h2>
				</div>
				<p>
					macOS 版本优先开放。正式申请内测码请使用官网（apps/site → /beta），本页只是客户端内的静态原型，不发送申请。
				</p>
				<a className="zg-secondary" href="#demo">
					先看上方演示
				</a>
			</section>
		</main>
	);
}
