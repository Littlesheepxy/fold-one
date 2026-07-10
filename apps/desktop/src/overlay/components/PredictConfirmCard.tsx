import { useEffect } from "react";
import { motion, useDragControls, useMotionValue } from "framer-motion";
import type { PredictDraftLine, PredictPhase, PredictSuggestion, PredictSurface } from "@fold/runtime";
import { ContextAppIcon } from "./ContextAppIcon.js";

interface Props {
	x: number;
	y: number;
	phase: PredictPhase | null | undefined;
	surface: PredictSurface | null | undefined;
	anchor: string | null | undefined;
	appName?: string | null;
	appPath?: string | null;
	windowTitle?: string | null;
	refining?: boolean;
	suggestions: PredictSuggestion[];
	drafts?: PredictDraftLine[];
	loading?: boolean;
	draftsLoading?: boolean;
	selectedIntent?: string | null;
	onPickIntent: (intent: string) => void;
	onInsertDraft: (text: string) => void;
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
	appName,
	appPath,
	windowTitle,
	refining,
	suggestions,
	drafts,
	loading,
	draftsLoading,
	selectedIntent,
	onPickIntent,
	onInsertDraft,
	onDismiss,
}: Props) {
	const initial = clampPosition(x + 14, y + 14, 340, 320);
	const posX = useMotionValue(initial.x);
	const posY = useMotionValue(initial.y);
	const dragControls = useDragControls();
	const isLoading = loading || draftsLoading;
	const isReply = surface === "reply";
	const sceneTitle = windowTitle || anchor;

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
			dragControls={dragControls}
			dragListener={false}
			dragMomentum={false}
			onDragStart={onDragStart}
			onDragEnd={onDragEnd}
			onClick={(e) => e.stopPropagation()}
			role="dialog"
			aria-label="情境预测"
		>
			<div className="fold-predict-card-head">
				<div
					className="fold-predict-card-drag-handle flex min-w-0 flex-1 items-start gap-2.5"
					onPointerDown={(event) => dragControls.start(event)}
				>
					{appName ? (
						<span className="fold-predict-card-app-icon" aria-hidden="true">
							<ContextAppIcon appName={appName} appPath={appPath} size={28} />
						</span>
					) : null}
					<div className="min-w-0 flex-1">
						<p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/45">
							{phase === "result" ? surfaceTitle(surface) : phase === "pick" ? "猜你想做" : "Fold"}
						</p>
						{sceneTitle ? (
							<p className="mt-0.5 truncate text-[14px] font-semibold text-white/95" title={sceneTitle}>
								{sceneTitle}
							</p>
						) : null}
						{appName && sceneTitle !== appName ? (
							<p className="mt-0.5 truncate text-[11px] text-white/50">{appName}</p>
						) : null}
					</div>
				</div>
				<button type="button" className="fold-predict-card-close" onClick={onDismiss} aria-label="关闭">
					×
				</button>
			</div>

			{refining ? (
				<p className="py-2 text-[12px] text-violet-200/90">正在听修改要求… 松开右 ⌘ 生成新草案</p>
			) : null}

			{isLoading && (
				<p className="py-3 text-[12px] text-white/55">
					{draftsLoading ? "正在生成回复…" : "正在读取情境…"}
				</p>
			)}

			{!isLoading && !refining && phase === "silent" && (
				<div className="space-y-2 py-1">
					<p className="text-[12px] leading-relaxed text-white/60">暂时看不清你想做什么</p>
				</div>
			)}

			{!isLoading && !refining && phase === "pick" && suggestions.length > 0 && (
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

			{!isLoading && !refining && phase === "result" && drafts && drafts.length > 0 && (
				<div className="space-y-2">
					{selectedIntent ? (
						<p className="text-[10px] text-white/40 truncate" title={selectedIntent}>
							你说：「{selectedIntent}」
						</p>
					) : null}
					<ul className="fold-predict-card-list">
						{drafts.map((d) => (
							<li key={d.id}>
								<button
									type="button"
									className="fold-predict-card-draft"
									onClick={() => onInsertDraft(d.text)}
									title="点击插入输入框"
								>
									{d.text}
								</button>
							</li>
						))}
					</ul>
				</div>
			)}

			<div className="fold-predict-card-foot fold-predict-card-foot--hint">
				{isReply ? (
					<p className="fold-predict-card-hint">
						<strong>点草案</strong>插入；继续<strong>按住右 ⌘</strong>说出修改要求
					</p>
				) : (
					<>
						<span className="text-[10px] text-white/30">⌥Space Agent · 按住右 ⌘ 代回 · Esc 取消</span>
					</>
				)}
			</div>
		</motion.div>
	);
}
