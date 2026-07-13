import { useEffect, useState } from "react";
import {
	KeyboardHotkeyVisual,
	type HotkeyVisualTarget,
} from "../components/KeyboardHotkeyVisual";
import {
	OnboardingPrimaryBtn,
	OnboardingShell,
} from "../components/OnboardingShell";

type ShortcutId = "structure" | "reply" | "agent";

const SHORTCUT_TARGETS: Record<ShortcutId, HotkeyVisualTarget> = {
	structure: "right-cmd",
	reply: "right-cmd",
	agent: "alt-space",
};

export function SummaryStep({ onFinish }: { onFinish: () => void }) {
	const [imes, setImes] = useState<Array<{ id: string; name: string; detected: boolean }>>([]);
	const [selected, setSelected] = useState<ShortcutId>("structure");

	useEffect(() => {
		void window.fold.listInstalledInputMethods().then((rows) => {
			setImes(
				(rows as Array<{ id: string; name: string; detected: boolean }>).filter((r) => r.detected),
			);
		});
	}, []);

	const sogou = imes.find((i) => i.id === "sogou" || i.id === "wetype");

	return (
		<OnboardingShell
			step="summary"
			left={
				<>
					<h1 className="fold-onboarding-title">说话，别打字</h1>
					<p className="fold-onboarding-sub">点选快捷键，右侧键盘会标出对应按键。</p>
					<div className="fold-onboarding-shortcut-grid">
						<button
							type="button"
							className={`fold-onboarding-shortcut-card main${selected === "structure" ? " is-selected" : ""}`}
							onClick={() => setSelected("structure")}
						>
							<p>语音输入</p>
							<kbd className="fold-onboarding-kbd">右 ⌘</kbd>
							<span className="text-[11px] text-[#86868b]">短按</span>
						</button>
						<button
							type="button"
							className={`fold-onboarding-shortcut-card${selected === "reply" ? " is-selected" : ""}`}
							onClick={() => setSelected("reply")}
						>
							<p>智能代回</p>
							<kbd className="fold-onboarding-kbd">右 ⌘</kbd>
							<span className="text-[11px] text-[#86868b]">长按</span>
						</button>
						<button
							type="button"
							className={`fold-onboarding-shortcut-card${selected === "agent" ? " is-selected" : ""}`}
							onClick={() => setSelected("agent")}
						>
							<p>Agent 任务</p>
							<kbd className="fold-onboarding-kbd">⌥ Space</kbd>
						</button>
					</div>
					<p className="fold-onboarding-sub mt-4">
						知更一直在记你的复制和工作轨迹，主页会继续「注意到了」。
					</p>
					{sogou ? (
						<p className="fold-onboarding-hint">
							检测到 {sogou.name}：可在设置 → 高级迁移输入法词库。
						</p>
					) : null}
				</>
			}
			right={
				<KeyboardHotkeyVisual
					target={SHORTCUT_TARGETS[selected]}
					preview
					size="sm"
				/>
			}
			footer={<OnboardingPrimaryBtn onClick={onFinish}>我们出发吧</OnboardingPrimaryBtn>}
		/>
	);
}
