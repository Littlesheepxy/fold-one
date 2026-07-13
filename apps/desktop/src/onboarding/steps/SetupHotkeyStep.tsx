import { useEffect, useRef, useState, type ReactNode } from "react";
import {
	KeyboardHotkeyVisual,
	type HotkeyVisualTarget,
} from "../components/KeyboardHotkeyVisual";
import {
	OnboardingPrimaryBtn,
	OnboardingSecondaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";

type TestTarget = "right-cmd" | "alt-space";

const TARGETS: TestTarget[] = ["right-cmd", "alt-space"];

const TARGET_COPY: Record<
	TestTarget,
	{ title: string; sub: ReactNode; hint: string }
> = {
	"right-cmd": {
		title: "按下以测试语音输入快捷键",
		sub: (
			<>
				我们推荐使用 <kbd className="fold-onboarding-kbd">右 ⌘</kbd>，位于空格键右侧。短按转写，长按代回。
			</>
		),
		hint: "按住时右 ⌘ 应变蓝，松开后恢复。",
	},
	"alt-space": {
		title: "按下以测试 Agent 快捷键",
		sub: (
			<>
				按 <kbd className="fold-onboarding-kbd">⌥</kbd> +{" "}
				<kbd className="fold-onboarding-kbd">Space</kbd> 唤出 Agent，说出任务即可执行。
			</>
		),
		hint: "按下时 ⌥ 与空格应变蓝；本页只检测按键，不会开始录音或执行任务。",
	},
};

const RIGHT_CMD_KEYS = new Set(["right-cmd", "f19", "f18"]);

export function SetupHotkeyStep({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
	const [target, setTarget] = useState<TestTarget>("right-cmd");
	const [pressed, setPressed] = useState(false);
	const [detected, setDetected] = useState({ rightCmd: false, altSpace: false });
	const [fallback, setFallback] = useState(false);
	const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

	const cycleTarget = () => {
		setTarget((t) => (t === "right-cmd" ? "alt-space" : "right-cmd"));
		setPressed(false);
	};

	const currentDetected = target === "right-cmd" ? detected.rightCmd : detected.altSpace;

	useEffect(() => {
		void window.fold.probeAccessibility().then((ax) => setFallback(!ax.available));
		return window.fold.onOnboardingHotkeyEvent((event) => {
			if (target === "right-cmd" && RIGHT_CMD_KEYS.has(event.key)) {
				if (event.phase === "down") {
					setPressed(true);
					setDetected((d) => ({ ...d, rightCmd: true }));
					if (event.key === "f19" || event.key === "f18") {
						if (flashTimer.current) clearTimeout(flashTimer.current);
						flashTimer.current = setTimeout(() => setPressed(false), 280);
					}
					return;
				}
				if (event.phase === "up") setPressed(false);
				return;
			}
			if (target === "alt-space" && event.key === "alt-space" && event.phase === "down") {
				setPressed(true);
				setDetected((d) => ({ ...d, altSpace: true }));
				if (flashTimer.current) clearTimeout(flashTimer.current);
				flashTimer.current = setTimeout(() => setPressed(false), 280);
			}
		});
	}, [target]);

	useEffect(
		() => () => {
			if (flashTimer.current) clearTimeout(flashTimer.current);
		},
		[],
	);

	const handlePrimary = () => {
		if (target === "right-cmd" && detected.rightCmd && !detected.altSpace) {
			setTarget("alt-space");
			setPressed(false);
			return;
		}
		onNext();
	};

	const copy = TARGET_COPY[target];

	return (
		<OnboardingShell
			step="hotkey"
			onBack={onBack}
			left={
				<>
					<h1 className="fold-onboarding-title">{copy.title}</h1>
					<div className="fold-onboarding-shortcut-picker" role="tablist" aria-label="选择要测试的快捷键">
						{TARGETS.map((id) => (
							<button
								key={id}
								type="button"
								role="tab"
								aria-selected={target === id}
								className={target === id ? "is-active" : ""}
								onClick={() => {
									setTarget(id);
									setPressed(false);
								}}
							>
								{id === "right-cmd" ? "右 ⌘ · 转写 / 代回" : "⌥ Space · Agent"}
							</button>
						))}
					</div>
					<p className="fold-onboarding-sub">{copy.sub}</p>
					<p className="fold-onboarding-hint">
						本页只检测按键是否可用，不会开始录音；下一步再体验真实转写。
					</p>
					{fallback && target === "right-cmd" ? (
						<p className="fold-onboarding-hint">
							未授权辅助功能时，可用 <kbd className="fold-onboarding-kbd">F19</kbd> /{" "}
							<kbd className="fold-onboarding-kbd">F18</kbd> 代替测试。
						</p>
					) : null}
					<p className="fold-onboarding-hint">{copy.hint}</p>
				</>
			}
			right={
				<KeyboardHotkeyVisual
					target={target as HotkeyVisualTarget}
					pressed={pressed}
					preview
				/>
			}
			footer={
				<>
					<OnboardingSecondaryBtn onClick={cycleTarget}>换个快捷键试试</OnboardingSecondaryBtn>
					<OnboardingPrimaryBtn onClick={handlePrimary}>
						{currentDetected
							? target === "right-cmd" && !detected.altSpace
								? "测好了，试 Agent"
								: "是的，继续"
							: "跳过，继续"}
					</OnboardingPrimaryBtn>
				</>
			}
		/>
	);
}
