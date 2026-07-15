import { useEffect, useState } from "react";
import { BrandIcon } from "../../settings/components/brand-icons";
import type { OnboardingScenario } from "../onboarding-scenarios";
import { getOnboardingScenario } from "../onboarding-scenarios";

function ComposeInput({
	body,
	placeholder,
	guide,
}: {
	body?: string;
	placeholder: string;
	guide?: string;
}) {
	const hasBody = Boolean(body?.trim());
	return (
		<>
			{guide ? (
				<div className="fold-onboarding-compose-anchor">
					<span>1</span>
					{guide}
				</div>
			) : null}
			<div
				className={`fold-onboarding-compose-input${hasBody ? "" : " is-empty"}${guide ? " is-guided" : ""}`}
			>
				<div className="fold-onboarding-compose-input-body">{hasBody ? body : placeholder}</div>
				<div className="fold-onboarding-compose-toolbar" aria-hidden="true">
					<span>＋</span>
					<span>Aa</span>
					<span>☺</span>
					<button type="button" tabIndex={-1} disabled>
						发送
					</button>
				</div>
			</div>
		</>
	);
}

export function AppComposeMock({
	scenario,
	body,
	incoming,
	placeholder = "口述内容会出现在这里…",
	composerGuide,
}: {
	scenario: OnboardingScenario;
	body?: string;
	incoming?: string;
	placeholder?: string;
	composerGuide?: string;
}) {
	const [appIcon, setAppIcon] = useState<string | null>(null);

	useEffect(() => {
		const names =
			scenario.id === "wechat"
				? ["WeChat", "微信"]
				: scenario.id === "feishu"
					? ["Lark", "Feishu", "飞书"]
					: scenario.id === "knowledge"
						? ["Notion"]
					: scenario.id === "slack"
						? ["Slack"]
						: ["Mail", "Gmail", "Google Chrome"];
		void window.fold.getFirstAppIcon(names).then(setAppIcon);
	}, [scenario.id]);

	const icon = appIcon ?? scenario.icon;

	if (scenario.kind === "email") {
		return (
			<div className="fold-onboarding-compose fold-onboarding-compose--email">
				<div className="fold-onboarding-compose-header">
					<BrandIcon src={icon} size={22} alt={scenario.label} className="fold-onboarding-compose-icon" />
					<span>{scenario.header}</span>
				</div>
				<div className="fold-onboarding-email-meta">
					<p>
						<span>收件人</span> {scenario.peerName} &lt;sarah@company.com&gt;
					</p>
					<p>
						<span>主题</span> Re: Q3 评审纪要
					</p>
				</div>
				<ComposeInput body={body} placeholder={placeholder} guide={composerGuide} />
			</div>
		);
	}

	if (scenario.kind === "document") {
		return (
			<div className="fold-onboarding-compose fold-onboarding-compose--document">
				<div className="fold-onboarding-compose-header">
					<BrandIcon src={icon} size={22} alt={scenario.label} className="fold-onboarding-compose-icon" />
					<span>{scenario.header}</span>
				</div>
				<div className="fold-onboarding-compose-input">{body || placeholder}</div>
			</div>
		);
	}

	return (
		<div className="fold-onboarding-compose">
			<div className="fold-onboarding-compose-header">
				<BrandIcon src={icon} size={22} alt={scenario.label} className="fold-onboarding-compose-icon" />
				<span>{scenario.header}</span>
			</div>
			{incoming ? (
				<div className="fold-onboarding-compose-bubble">
					<span className="fold-onboarding-compose-avatar" aria-hidden="true">
						{scenario.peerName.slice(0, 1)}
					</span>
					<p>{incoming}</p>
				</div>
			) : null}
			<ComposeInput body={body} placeholder={placeholder} guide={composerGuide} />
		</div>
	);
}

/** @deprecated 用 AppComposeMock */
export function WeChatMock(props: {
	incoming?: string;
	draft?: string;
	placeholder?: string;
	peerName?: string;
}) {
	const scenario = {
		...getOnboardingScenario("wechat"),
		peerName: props.peerName ?? getOnboardingScenario("wechat").peerName,
	};
	return (
		<AppComposeMock
			scenario={scenario}
			incoming={props.incoming}
			body={props.draft}
			placeholder={props.placeholder}
		/>
	);
}
