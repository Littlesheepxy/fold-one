import { useEffect } from "react";
import { motion, useMotionValue } from "framer-motion";
import type { PredictDraftLine, PredictPhase, PredictSuggestion, PredictSurface } from "@fold/runtime";

interface Props {
	x: number;
	y: number;
	phase: PredictPhase | null | undefined;
	surface: PredictSurface | null | undefined;
	anchor: string | null | undefined;
	suggestions: PredictSuggestion[];
	drafts?: PredictDraftLine[];
	loading?: boolean;
	draftsLoading?: boolean;
	selectedIntent?: string | null;
	onPickIntent: (intent: string) => void;
	onInsertDraft: (text: string) => void;
	onCopyDraft: (text: string) => void;
	onVoiceOther: () => void;
	onDismiss: () => void;
}

function surfaceTitle(surface: PredictSurface | null | undefined) {
	if (surface === "reply") return "拟回复";
	if (surface === "todo") return "拟待办";
	return "建议";
}

function clampPosition(x: number, y: number, width: number, height: number) {
	const pad = 12;
	const maxX = Math.max(pad, window.innerWidth - width - pad);
	const maxY = Math.max(pad, window.innerHeight - height - pad);
	return {
		x: Math.min(Math.max(pad, x), maxX),
		y: Math.min(Math.max(pad, y), maxY),
	};
}

export function PredictConfirmCard({
	x,
	y,
	phase,
	surface,
	anchor,
	suggestions,
	drafts,
	loading,
	draftsLoading,
	selectedIntent,
	onPickIntent,
	onInsertDraft,
	onCopyDraft,
	onVoiceOther,
	onDismiss,
}: Props) {
	const initial = clampPosition(x + 14, y + 14, 340, 320);
	const posX = useMotionValue(initial.x);
	const posY = useMotionValue(initial.y);
	const isLoading = loading || draftsLoading;

	useEffect(() => {
		const next = clampPosition(x + 14, y + 14, 340, 320);
		posX.set(next.x);
		posY.set(next.y);
	}, [x, y, posX, posY]);

	const onDragStart = () => {
		document.body.dataset.foldDragging = "true";
		window.fold.setMousePassthrough(false);
	};

	const onDragEnd = () => {
		setTimeout(() => {
			delete document.body.dataset.foldDragging;
		}, 120);
	};

	return (
		<motion.div
			className="fold-predict-card pointer-events-auto"
			data-fold-interactive
			style={{ x: posX, y: posY, left: 0, top: 0 }}
			drag
			dragHandle=".fold-predict-card-drag-handle"
			dragMomentum={false}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onClick={(e) => e.stopPropagation()}
			role="dialog"
			aria-label="情境预测"
		>
			<div className="fold-predict-card-head">
				<div className="fold-predict-card-drag-handle min-w-0 flex-1">
					<p className="text-[13px] font-semibold text-white/95">
						{phase === "result" ? surfaceTitle(surface) : phase === "pick" ? "猜你想做" : "Fold"}
					</p>
					{anchor && (
						<p className="mt-0.5 truncate text-[11px] text-white/50" title={anchor}>
							📍 {anchor}
						</p>
					)}
				</div>
				<button type="button" className="fold-predict-card-close" onClick={onDismiss} aria-label="关闭">
					×
				</button>
			</div>

			{isLoading && (
				<p className="py-3 text-[12px] text-white/55">
					{draftsLoading ? "正在生成…" : "正在读取情境…"}
				</p>
			)}

			{!isLoading && phase === "silent" && (
				<div className="space-y-2 py-1">
					<p className="text-[12px] leading-relaxed text-white/60">暂时看不清你想做什么</p>
					<button type="button" className="fold-predict-card-btn" onClick={onVoiceOther}>
						短按 右⌘ 语音整理
					</button>
				</div>
			)}

			{!isLoading && phase === "pick" && suggestions.length > 0 && (
				<ul className="fold-predict-card-list">
					{suggestions.map((s) => (
						<li key={s.intent}>
							<button
								type="button"
								className="fold-predict-card-option"
								title={`${s.reason} · ${s.intent}`}
								onClick={() => onPickIntent(s.intent)}
							>
								<span className="block text-[13px] font-medium text-white">{s.label}</span>
								<span className="mt-0.5 block text-[10px] text-white/45">{s.reason}</span>
							</button>
						</li>
					))}
				</ul>
			)}

			{!isLoading && phase === "result" && drafts && drafts.length > 0 && (
				<div className="space-y-2">
					{selectedIntent && (
						<p className="text-[10px] text-white/40 truncate" title={selectedIntent}>
							{selectedIntent}
						</p>
					)}
					<ul className="fold-predict-card-list">
						{drafts.map((d) => (
							<li key={d.id}>
								<button
									type="button"
									className="fold-predict-card-draft"
									onClick={() => onInsertDraft(d.text)}
									title="点击插入输入框（已复制到剪贴板）"
								>
									{d.text}
								</button>
							</li>
						))}
					</ul>
					<div className="flex flex-wrap gap-2 pt-1">
						{drafts[0] && (
							<button
								type="button"
								className="fold-predict-card-btn subtle"
								onClick={() => onCopyDraft(drafts[0]!.text)}
							>
								复制
							</button>
						)}
					</div>
				</div>
			)}

			<div className="fold-predict-card-foot">
				<button type="button" className="fold-predict-card-link" onClick={onVoiceOther}>
					短按 右⌘ 语音整理
				</button>
				<span className="text-[10px] text-white/30">⌥Space Agent · 长按右⌘ 拟回复 · Esc</span>
			</div>
		</motion.div>
	);
}
