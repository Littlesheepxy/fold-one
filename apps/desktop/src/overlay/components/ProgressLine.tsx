import { AnimatePresence, motion } from "framer-motion";
import { ScrollingLine } from "./ScrollingLine";

interface Step {
	id: string;
	label: string;
	status: string;
}

interface Props {
	status: string;
	transcript?: string;
	thinkingText?: string;
	progressMessage?: string;
	steps?: Step[];
	currentApp?: string | null;
}

function localizeProgressMessage(message: string): string {
	const agent = message.match(/^Running local agent subagent \((.+)\)$/)?.[1];
	if (agent) {
		const label = agent === "auto" ? "自动" : agent;
		return `正在运行本地 Agent（${label}）`;
	}
	return message;
}

function pickThinkingSnippet(thinkingText: string): string {
	const goal = thinkingText.match(/^计划目标：(.+)$/m)?.[1]?.trim();
	if (goal) return goal;
	const intent = thinkingText.match(/^用户意图：(.+)$/m)?.[1]?.trim();
	if (intent) return intent;
	return thinkingText.replace(/\s*\n\s*/g, " · ").trim();
}

function resolveProgressLine({
	status,
	transcript,
	thinkingText,
	progressMessage,
	steps,
	currentApp,
}: Props): string {
	const message = progressMessage?.trim();
	if (message) return localizeProgressMessage(message);

	const list = steps ?? [];
	const running = list.find((s) => s.status === "running");
	if (running) {
		return currentApp ? `${running.label} · ${currentApp}` : running.label;
	}

	if (status === "working" && list.length > 0) {
		const next = list.find((s) => s.status === "pending");
		if (next) return next.label;
		const lastDone = [...list].reverse().find((s) => s.status === "done");
		if (lastDone) return `${lastDone.label} 完成`;
	}

	if (status === "planning") {
		const thinking = thinkingText?.trim();
		if (thinking) return pickThinkingSnippet(thinking);
		if (list.length > 0) return list[0]?.label ?? "Fold 正在规划…";
	}

	if (status === "understanding") {
		const intent = transcript?.trim();
		return intent ? intent : "正在理解任务…";
	}

	return "Fold 正在处理…";
}

export function ProgressLine(props: Props) {
	const line = resolveProgressLine(props);

	return (
		<div className="fold-progress-line">
			<AnimatePresence mode="wait" initial={false}>
				<motion.div
					key={line}
					className="fold-progress-line-inner"
					initial={{ opacity: 0, y: 4 }}
					animate={{ opacity: 1, y: 0 }}
					exit={{ opacity: 0, y: -4 }}
					transition={{ duration: 0.16 }}
				>
					<ScrollingLine text={line} className="text-sm leading-5 text-white/90" />
				</motion.div>
			</AnimatePresence>
		</div>
	);
}
