import { useEffect, useState } from "react";
import { motion, useDragControls, useMotionValue } from "framer-motion";
import { ContextAppIcon } from "./ContextAppIcon.js";

interface Props {
	x: number;
	y: number;
	text: string;
	appName?: string | null;
	appPath?: string | null;
	pageUrl?: string | null;
	onInsert: (text: string) => Promise<{ ok: boolean; pasted: boolean }>;
	onDismiss: () => void;
}

const STRUCTURE_DRAFT_WIDTH = 360;
const STRUCTURE_DRAFT_HEIGHT = 340;

function clampPosition(x: number, y: number, width: number, height: number) {
	const pad = 12;
	const maxX = Math.max(pad, window.innerWidth - width - pad);
	const maxY = Math.max(pad, window.innerHeight - height - pad);
	return {
		x: Math.min(Math.max(pad, x), maxX),
		y: Math.min(Math.max(pad, y), maxY),
	};
}

export function StructureDraftCard({
	x,
	y,
	text,
	appName,
	appPath,
	pageUrl,
	onInsert,
	onDismiss,
}: Props) {
	const [draft, setDraft] = useState(text);
	const [inserting, setInserting] = useState(false);
	const [copied, setCopied] = useState(false);
	const [insertHint, setInsertHint] = useState<string | null>(null);
	const initial = clampPosition(
		x - STRUCTURE_DRAFT_WIDTH / 2,
		y - 320,
		STRUCTURE_DRAFT_WIDTH,
		STRUCTURE_DRAFT_HEIGHT,
	);
	const posX = useMotionValue(initial.x);
	const posY = useMotionValue(initial.y);
	const dragControls = useDragControls();

	useEffect(() => {
		setDraft(text);
		setInsertHint(null);
		setCopied(false);
	}, [text]);

	useEffect(() => {
		const next = clampPosition(
			x - STRUCTURE_DRAFT_WIDTH / 2,
			y - 320,
			STRUCTURE_DRAFT_WIDTH,
			STRUCTURE_DRAFT_HEIGHT,
		);
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

	const handleCopy = async () => {
		const trimmed = draft.trim();
		if (!trimmed) return;
		const result = await window.fold.copyText(trimmed);
		if (result.ok) {
			setCopied(true);
			setTimeout(() => setCopied(false), 1600);
		}
	};

	const handleInsert = async () => {
		const trimmed = draft.trim();
		if (!trimmed || inserting) return;
		setInserting(true);
		setInsertHint(null);
		try {
			const result = await onInsert(trimmed);
			if (result.pasted) {
				setInsertHint("已插入");
				setTimeout(() => onDismiss(), 500);
				return;
			}
			setInsertHint("未能自动粘贴，请检查辅助功能权限后重试");
		} catch {
			setInsertHint("插入失败，请重试或先复制");
		} finally {
			setInserting(false);
		}
	};

	return (
		<motion.div
			className="fold-predict-card fold-structure-draft-card pointer-events-auto"
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
			aria-label="转写草稿"
		>
			<div className="fold-predict-card-head">
				<div
					className="fold-predict-card-drag-handle flex min-w-0 flex-1 items-start gap-2.5"
					onPointerDown={(event) => dragControls.start(event)}
				>
					{appName || pageUrl ? (
						<span className="fold-predict-card-app-icon" aria-hidden="true">
							<ContextAppIcon appName={appName} appPath={appPath} pageUrl={pageUrl} size={28} />
						</span>
					) : null}
					<div className="min-w-0 flex-1">
						<p className="text-[10px] font-semibold uppercase tracking-[0.06em] text-white/45">
							转写草稿
						</p>
						<p className="mt-0.5 truncate text-[14px] font-semibold text-white/95">
							确认后再插入
						</p>
					</div>
				</div>
				<button type="button" className="fold-predict-card-close" onClick={onDismiss} aria-label="关闭">
					×
				</button>
			</div>

			<textarea
				className="fold-structure-draft-input"
				value={draft}
				onChange={(e) => setDraft(e.target.value)}
				rows={8}
				spellCheck={false}
			/>

			<div className="fold-structure-draft-actions">
				<button
					type="button"
					className="fold-predict-card-btn"
					disabled={!draft.trim() || inserting}
					onClick={() => void handleInsert()}
				>
					{inserting ? "插入中…" : insertHint === "已插入" ? "已插入" : "插入输入框"}
				</button>
				<button
					type="button"
					className="fold-predict-card-btn subtle"
					onClick={() => void handleCopy()}
				>
					{copied ? "已复制" : "复制"}
				</button>
			</div>

			<div className="fold-predict-card-foot fold-predict-card-foot--hint">
				{insertHint && insertHint !== "已插入" ? (
					<p className="fold-predict-card-hint text-amber-200/90">{insertHint}</p>
				) : null}
				<p className="fold-predict-card-hint">
					可在设置中开启<strong>转写后自动插入</strong>以跳过此步骤
				</p>
			</div>
		</motion.div>
	);
}
