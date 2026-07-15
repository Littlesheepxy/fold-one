import { animate, motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useOverlayStore } from "./useOverlayStore";
import { useVoiceHandlers } from "./useVoice";
import { useProcessingFill, PROCESSING_FILL_COMPLETE } from "./useProcessingFill";
import { useMousePassthrough } from "./useMousePassthrough";
import { GreenCheckMark } from "./components/GreenCheckMark";
import { VoiceWave } from "./components/VoiceWave";
import { StepList } from "./components/StepList";
import { ProgressLine } from "./components/ProgressLine";
import { AskOptions } from "./components/AskOptions";
import { PredictConfirmCard } from "./components/PredictConfirmCard";
import { voiceSurfaceLabel } from "../lib/page-context";
import { StructureDraftCard } from "./components/StructureDraftCard";
import { ContextAppIcon } from "./components/ContextAppIcon";
import { playFoldSoundForStatus, preloadFoldSounds } from "./sounds.js";
import { ZhigengLogoMark } from "../components/ZhigengLogoMark";
import { PRODUCT_NAME } from "../brand/constants";
import {
	type DisplayBounds,
	type WidgetPosition,
	DOCKED_WIDTH,
	ORB_SIZE,
	clampDragX,
	clampWidgetPosition,
	clampY,
	defaultWidgetPosition,
	dockedX,
	expandedX,
	isUsableSavedPosition,
	resolveSnapSide,
} from "./widget-position";

function friendlyError(raw: string | null | undefined): string {
	if (!raw) return "出错了";
	if (raw.includes("pdf.fields.nonEmpty")) {
		return "PDF 没读到有效字段（需安装 pymupdf，或 Downloads 里放一份报价 PDF）";
	}
	if (raw.includes("No object generated") || raw.includes("could not parse the response")) {
		return "Planner 没返回有效计划，请重试";
	}
	if (raw.includes("mail.draft.exists")) return "邮件草稿创建失败";
	return raw.replace(/^Validation failed:\s*/i, "");
}

function HomeIcon() {
	return (
		<svg className="fold-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M4 10.5L12 4.5L20 10.5V19.5C20 20.05 19.55 20.5 19 20.5H14.5V15H9.5V20.5H5C4.45 20.5 4 20.05 4 19.5V10.5Z"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function SettingsIcon() {
	return (
		<svg className="fold-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 0 0 12 8.5Z"
				stroke="currentColor"
				strokeWidth="1.8"
			/>
			<path
				d="M19 12a7.2 7.2 0 0 0-.08-1.04l2.02-1.58-2-3.46-2.38.96a7.1 7.1 0 0 0-1.8-1.04L14.4 3h-4.8l-.36 2.84a7.1 7.1 0 0 0-1.8 1.04l-2.38-.96-2 3.46 2.02 1.58A7.2 7.2 0 0 0 5 12c0 .35.03.7.08 1.04l-2.02 1.58 2 3.46 2.38-.96a7.1 7.1 0 0 0 1.8 1.04L9.6 21h4.8l.36-2.84a7.1 7.1 0 0 0 1.8-1.04l2.38.96 2-3.46-2.02-1.58c.05-.34.08-.69.08-1.04Z"
				stroke="currentColor"
				strokeWidth="1.8"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function CloseIcon() {
	return (
		<svg className="fold-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path
				d="M7 7L17 17M17 7L7 17"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
			/>
		</svg>
	);
}

function MoreIcon() {
	return (
		<svg className="fold-menu-icon" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<circle cx="7" cy="12" r="1.6" fill="currentColor" />
			<circle cx="12" cy="12" r="1.6" fill="currentColor" />
			<circle cx="17" cy="12" r="1.6" fill="currentColor" />
		</svg>
	);
}

function IdleActionRail({ onOpenChange }: { onOpenChange?: (open: boolean) => void }) {
	const [open, setOpen] = useState(false);

	const setRailOpen = (next: boolean) => {
		setOpen(next);
		onOpenChange?.(next);
	};

	return (
		<div
			className={`fold-idle-actions${open ? " fold-idle-actions-open" : ""}`}
			onMouseEnter={() => setRailOpen(true)}
			onMouseLeave={() => setRailOpen(false)}
			onClick={(e) => e.stopPropagation()}
		>
			{!open ? (
				<button type="button" className="fold-idle-action-btn" aria-label="更多" title="更多">
					<MoreIcon />
				</button>
			) : (
				<>
					<button
						type="button"
						className="fold-idle-action-btn"
						onClick={() => void window.fold.openSettings()}
						aria-label="主页"
						title="主页"
					>
						<HomeIcon />
					</button>
					<button
						type="button"
						className="fold-idle-action-btn"
						onClick={() => void window.fold.openSettings("settings")}
						aria-label="设置"
						title="设置"
					>
						<SettingsIcon />
					</button>
					<button
						type="button"
						className="fold-idle-action-btn"
						onClick={() => void window.fold.quit()}
						aria-label="关闭"
						title="关闭"
					>
						<CloseIcon />
					</button>
				</>
			)}
		</div>
	);
}

function MultiColorBorderBeam({
	duration = 4,
	borderWidth = 1.5,
	colors = ["#3b82f6", "#8b5cf6", "#ec4899", "#10b981", "#06b6d4"],
}: {
	duration?: number;
	borderWidth?: number;
	colors?: string[];
}) {
	const stops = ["transparent 0deg", "transparent 55deg"];
	colors.forEach((color, i) => {
		const deg = 70 + (i / Math.max(colors.length - 1, 1)) * 100;
		stops.push(`${color} ${deg}deg`);
	});
	stops.push("transparent 190deg", "transparent 360deg");

	return (
		<div
			className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]"
			style={{
				padding: borderWidth,
				WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
				WebkitMaskComposite: "xor",
				maskComposite: "exclude",
			}}
		>
			<motion.div
				className="absolute inset-[-120%]"
				animate={{ rotate: 360 }}
				transition={{ repeat: Number.POSITIVE_INFINITY, duration, ease: "linear" }}
				style={{
					background: `conic-gradient(from 0deg, ${stops.join(", ")})`,
				}}
			/>
		</div>
	);
}

function compactSummary(result: string | null | undefined) {
	return result ?? `${PRODUCT_NAME} 已完成任务`;
}

function PredictSuggestions({
	anchor,
	suggestions,
	mode,
	onRun,
	onDismiss,
}: {
	anchor: string | null | undefined;
	suggestions: Array<{ intent: string; label: string; confidence: number; reason: string }>;
	mode: string | null | undefined;
	onRun: (intent: string) => void;
	onDismiss: () => void;
}) {
	if (mode === "silent" || !suggestions.length) {
		const isLoading = anchor?.includes("正在读取");
		return (
			<div className="min-w-0 flex-1">
				<p className="text-sm font-medium whitespace-nowrap">
					{isLoading ? anchor : "暂无高把握推荐"}
				</p>
				{!isLoading && (
					<p className="mt-1 text-xs text-white/45">多执行几次任务后，{PRODUCT_NAME} 会根据你的习惯预测下一步</p>
				)}
				{!isLoading && (
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDismiss();
						}}
						className="mt-2 rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/20"
					>
						关闭
					</button>
				)}
			</div>
		);
	}

	return (
		<div className="min-w-0 flex-1 space-y-2">
			<div>
				<p className="text-sm font-medium">猜你想做</p>
				{anchor && (
					<p className="mt-0.5 truncate text-xs text-white/50" title={anchor}>
						📍 {anchor}
					</p>
				)}
			</div>
			<ul className="space-y-1.5">
				{suggestions.map((s) => (
					<li key={s.intent}>
						<button
							type="button"
							className="fold-predict-chip w-full text-left"
							title={`${s.reason} · ${s.intent}`}
							onClick={(e) => {
								e.stopPropagation();
								onRun(s.intent);
							}}
						>
							<span className="block truncate text-[13px] font-medium text-white">{s.label}</span>
							<span className="mt-0.5 block truncate text-[10px] text-white/45">{s.reason}</span>
						</button>
					</li>
				))}
			</ul>
			<button
				type="button"
				onClick={(e) => {
					e.stopPropagation();
					onDismiss();
				}}
				className="text-[10px] text-white/40 hover:text-white/60"
			>
				Esc 关闭
			</button>
		</div>
	);
}

const PANEL_SAFE_WIDTH = 460;

function fallbackDisplayBounds(): DisplayBounds {
	return {
		x: 0,
		y: 0,
		width: typeof window !== "undefined" ? window.innerWidth : 1512,
		height: typeof window !== "undefined" ? window.innerHeight : 900,
	};
}

export function OverlayApp() {
	const {
		status,
		transcript,
		thinkingText,
		progressMessage,
		steps,
		currentApp,
		result,
		resultDetail,
		verificationChecks,
		undoAvailable,
		error,
		askTitle,
		askMessage,
		askHint,
		askOptions,
		voiceMode,
		predictMode,
		predictPhase,
		predictSurface,
		predictAnchor,
		predictSuggestions,
		predictDrafts,
		predictSelectedIntent,
		predictDraftsLoading,
		predictCursor,
		contextAppName,
		contextAppPath,
		contextWindowTitle,
		contextPageUrl,
		contextPageLabel,
		predictRefining,
		voiceTabPlacement,
		voiceHint,
		widgetDisplayBounds,
		structureDraftOpen,
		voiceLevel,
		setState,
		setVoiceLevel,
	} = useOverlayStore();

	const [mockAsr, setMockAsr] = useState(true);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [panelOpen, setPanelOpen] = useState(false);
	const [displayBounds, setDisplayBounds] = useState<DisplayBounds>(fallbackDisplayBounds);
	const [bootstrapped, setBootstrapped] = useState(false);
	const initialPosition = useRef<WidgetPosition>({ x: 0, y: 0, snapSide: null });
	const x = useMotionValue(initialPosition.current.x);
	const y = useMotionValue(initialPosition.current.y);
	const positionRef = useRef(initialPosition.current);
	const [anchorPosition, setAnchorPosition] = useState(initialPosition.current);
	const [hovered, setHovered] = useState(false);
	const [idleRailOpen, setIdleRailOpen] = useState(false);
	const prevStatusRef = useRef(status);
	const dragMovedRef = useRef(false);

	useVoiceHandlers();
	useMousePassthrough();

	const applyWidgetPosition = (pos: WidgetPosition, area: DisplayBounds) => {
		const next = clampWidgetPosition(pos, area);
		x.set(next.x);
		y.set(next.y);
		positionRef.current = next;
		setAnchorPosition(next);
		window.localStorage.setItem("fold-widget-position", JSON.stringify(next));
		return next;
	};

	const bootstrapWidgetPosition = (area: DisplayBounds) => {
		const saved = window.localStorage.getItem("fold-widget-position");
		let seed = defaultWidgetPosition(area);
		if (saved) {
			try {
				const parsed = JSON.parse(saved) as WidgetPosition;
				if (isUsableSavedPosition(parsed, area)) {
					seed = clampWidgetPosition({ x: parsed.x, y: parsed.y, snapSide: parsed.snapSide ?? null }, area);
				}
			} catch {
				// ignore corrupt localStorage
			}
		}
		setDisplayBounds(area);
		initialPosition.current = applyWidgetPosition(seed, area);
		setBootstrapped(true);
	};

	const boundsKey = widgetDisplayBounds
		? `${widgetDisplayBounds.x}:${widgetDisplayBounds.y}:${widgetDisplayBounds.width}:${widgetDisplayBounds.height}`
		: "";

	useLayoutEffect(() => {
		if (!widgetDisplayBounds) return;
		bootstrapWidgetPosition(widgetDisplayBounds);
	}, [boundsKey]);

	useEffect(() => {
		const syncViewport = () => {
			const w = window.innerWidth;
			const h = window.innerHeight;
			for (const el of [document.documentElement, document.body, document.getElementById("root")]) {
				if (!el) continue;
				el.style.width = `${w}px`;
				el.style.height = `${h}px`;
			}
		};
		syncViewport();
		window.addEventListener("resize", syncViewport);
		return () => window.removeEventListener("resize", syncViewport);
	}, []);

	useEffect(() => {
		if (widgetDisplayBounds) return;
		let cancelled = false;
		void (async () => {
			try {
				const area = await window.fold.getDisplayWorkArea();
				if (cancelled) return;
				bootstrapWidgetPosition(area);
			} catch {
				if (cancelled) return;
				const state = await window.fold.getOverlayState();
				if (state.widgetDisplayBounds) {
					bootstrapWidgetPosition(state.widgetDisplayBounds);
				}
			}
		})();
		return () => {
			cancelled = true;
		};
	}, [widgetDisplayBounds]);

	useEffect(() => {
		return window.fold.onState((state) => setState(state));
	}, [setState]);

	useEffect(() => {
		void window.fold.getOverlayState().then((state) => setState(state));
	}, [setState]);

	useEffect(() => {
		void window.fold.getUseMockAsr().then(setMockAsr);
	}, []);

	useEffect(() => {
		preloadFoldSounds();
	}, []);

	useEffect(() => {
		const prev = prevStatusRef.current;
		playFoldSoundForStatus(prev, status, voiceMode);
		if (status !== "done") setDetailsOpen(false);
		if (status !== "idle" && status !== "predict") setPanelOpen(false);
		if (status !== "idle") setIdleRailOpen(false);
		prevStatusRef.current = status;
	}, [status, voiceMode]);

	useEffect(() => {
		const handler = (e: Event) => {
			const level = (e as CustomEvent<number>).detail;
			if (typeof level === "number") setVoiceLevel(level);
		};
		window.addEventListener("fold:voice-level-local", handler);
		const off = window.fold.onVoiceLevel((level) => setVoiceLevel(level));
		return () => {
			window.removeEventListener("fold:voice-level-local", handler);
			off();
		};
	}, [setVoiceLevel]);

	useEffect(() => {
		if (status !== "listening") setVoiceLevel(0);
	}, [status, setVoiceLevel]);

	const isAgentExecuting =
		status === "understanding" || status === "planning" || status === "working";
	const isVoiceFormatting = status === "formatting";
	const isVoiceAssist = voiceMode === "structure" || voiceMode === "reply";
	const usesFillProgress =
		isVoiceAssist && (status === "formatting" || status === "done");
	const fillProgress = useProcessingFill(status, usesFillProgress);
	const fillComplete = fillProgress >= PROCESSING_FILL_COMPLETE;
	const isAuthPrompt = status === "ask";
	const isPredictCard = status === "predict" && Boolean(predictCursor);
	const isStructureDraftCard = Boolean(structureDraftOpen) && voiceMode === "structure";
	const voiceSurface = voiceSurfaceLabel({
		voiceMode,
		contextPageUrl,
		contextPageLabel,
		contextWindowTitle,
	});
	const inputScene =
		isVoiceAssist &&
		(status === "listening" || isVoiceFormatting || status === "done");
	const replyPredictScene =
		status === "predict" && predictSurface === "reply" && Boolean(voiceTabPlacement);
	const voiceTabAnchorScene = inputScene || replyPredictScene;

	const inputSettling = inputScene && status === "done" && !fillComplete;
	const isVoiceFormattingActive = isVoiceFormatting || inputSettling;
	const isExecuting = isAgentExecuting || isVoiceFormattingActive;
	const isProcessingFill = isVoiceFormattingActive;
	const showCheckmark = status === "done" && (inputScene ? fillComplete : true);
	const predictCardPosition =
		isPredictCard && predictSurface === "reply" && voiceTabPlacement
			? {
					x: Math.max(12, voiceTabPlacement.left - 184),
					y: Math.max(12, voiceTabPlacement.top - 340),
				}
			: isPredictCard && predictSurface === "reply" && typeof window !== "undefined"
				? {
						x: Math.max(12, window.innerWidth / 2 - 184),
						y: Math.max(12, window.innerHeight - 360),
					}
				: predictCursor;
	const structureDraftPosition =
		isStructureDraftCard && voiceTabPlacement
			? { x: voiceTabPlacement.left, y: voiceTabPlacement.top }
			: isStructureDraftCard && typeof window !== "undefined"
				? { x: window.innerWidth / 2, y: window.innerHeight - 120 }
				: null;
	const collapsed = (status === "idle" && !panelOpen) || isPredictCard || isStructureDraftCard;
	const dockedSide = collapsed ? anchorPosition.snapSide : null;
	const idleShellWidth = idleRailOpen ? 424 : 360;
	const shellWidth = inputScene
		? isVoiceFormattingActive
			? 96
			: status === "done"
				? fillComplete
					? 58
					: 96
				: voiceHint
					? 360
				: contextPageUrl
					? 218
					: contextAppName
					? 176
					: 152
		: collapsed
		? (dockedSide ? DOCKED_WIDTH : ORB_SIZE)
		: status === "error"
			? 360
			: status === "idle"
				? idleShellWidth
			: status === "predict"
				? 400
			: status === "working" || status === "planning" || status === "understanding"
				? 300
				: status === "formatting"
					? 132
				: status === "done"
					? 320
				: status === "ask"
					? 400
				: status === "listening"
					? 320
					: 390;
	const safeVoiceTabPlacement =
		voiceTabPlacement && typeof window !== "undefined"
			? {
					left: Math.min(
						window.innerWidth - shellWidth / 2 - 12,
						Math.max(shellWidth / 2 + 12, voiceTabPlacement.left),
					),
					top: Math.min(
						window.innerHeight - 50,
						Math.max(12, voiceTabPlacement.top),
					),
				}
			: voiceTabPlacement;
	const expandedLeft = expandedX(anchorPosition.x, shellWidth, anchorPosition.snapSide ?? null, displayBounds);

	useEffect(() => {
		if (!bootstrapped) return;
		if (inputScene) return;
		if (document.body.dataset.foldDragging === "true") return;
		const target = {
			x: collapsed
				? (positionRef.current.snapSide
					? dockedX(positionRef.current.snapSide, displayBounds)
					: clampDragX(positionRef.current.x, displayBounds))
				: expandedLeft,
			y: clampY(positionRef.current.y, displayBounds),
			snapSide: collapsed ? positionRef.current.snapSide : positionRef.current.snapSide,
		};
		animate(x, target.x, { type: "spring", stiffness: 520, damping: 42, mass: 0.75 });
		animate(y, target.y, { type: "spring", stiffness: 520, damping: 42, mass: 0.75 });
		positionRef.current = target;
		setAnchorPosition(target);
		window.localStorage.setItem("fold-widget-position", JSON.stringify(target));
	}, [bootstrapped, collapsed, displayBounds, expandedLeft, inputScene, x, y, shellWidth]);

	const onDragStart = () => {
		dragMovedRef.current = true;
		document.body.dataset.foldDragging = "true";
		window.fold.setMousePassthrough(false);
	};

	const onDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: { offset: { x: number; y: number } }) => {
		dragMovedRef.current = Math.abs(info.offset.x) > 4 || Math.abs(info.offset.y) > 4;
		const raw = {
			x: x.get(),
			y: y.get(),
		};
		void (async () => {
			const area = await window.fold.getDisplayWorkArea({
				x: raw.x + ORB_SIZE / 2,
				y: raw.y + ORB_SIZE / 2,
			});
			setDisplayBounds(area);
			const snapSide = collapsed ? resolveSnapSide(raw.x, area) : null;
			const next = {
				x: snapSide ? dockedX(snapSide, area) : clampDragX(raw.x, area),
				y: clampY(raw.y, area),
				snapSide,
			};
			animate(x, next.x, { type: "spring", stiffness: 520, damping: 38, mass: 0.8 });
			animate(y, next.y, { type: "spring", stiffness: 520, damping: 38, mass: 0.8 });
			positionRef.current = next;
			setAnchorPosition(next);
			window.localStorage.setItem("fold-widget-position", JSON.stringify(next));
		})();
		setTimeout(() => {
			dragMovedRef.current = false;
			delete document.body.dataset.foldDragging;
			window.fold.setMousePassthrough(false);
		}, 220);
	};

	return (
		<div className="pointer-events-none absolute inset-0">
			<motion.div
				data-fold-interactive=""
				drag={!inputScene}
				dragMomentum={false}
				onDragStart={onDragStart}
				onDragEnd={onDragEnd}
				onMouseEnter={() => {
					setHovered(true);
					window.fold.setMousePassthrough(false);
				}}
				onMouseLeave={() => {
					setHovered(false);
					if (document.body.dataset.foldDragging !== "true") {
						window.fold.setMousePassthrough(true);
					}
				}}
				style={
					voiceTabAnchorScene
						? safeVoiceTabPlacement
							? {
									left: safeVoiceTabPlacement.left - shellWidth / 2,
									top: safeVoiceTabPlacement.top,
									right: "auto",
									bottom: "auto",
									x: 0,
									y: 0,
								}
							: {
									left: `calc(50% - ${shellWidth / 2}px)`,
									right: "auto",
									top: "auto",
									bottom: Math.max(96, Math.round(window.innerHeight * 0.12)),
									x: 0,
									y: 0,
								}
						: { x, y, top: 0, left: 0, opacity: bootstrapped ? 1 : 0 }
				}
				className={`${voiceTabAnchorScene ? "fold-input-tab-anchor" : "absolute"} pointer-events-auto select-none`}
			>
				<motion.div
					className={`fold-shell ${collapsed ? "fold-shell-collapsed" : ""} ${
						inputScene ? "fold-input-tab" : ""
					} ${
						isProcessingFill ? "fold-shell-fill" : ""
					} ${
						isAgentExecuting ? "fold-shell-executing is-processing" : ""
					} ${
						isVoiceFormattingActive ? "fold-shell-formatting" : ""
					} ${
						showCheckmark ? "is-done" : ""
					} ${
						!collapsed && (status === "error" || status === "ask") ? "fold-shell-expanded" : ""
					} ${
						!collapsed && status === "idle" ? "fold-shell-idle" : ""
					} ${
						status === "predict" && !isPredictCard ? "fold-shell-predict fold-shell-expanded" : ""
					} ${
						dockedSide ? `fold-shell-docked fold-shell-docked-${dockedSide}` : ""
					} ${
						!collapsed && anchorPosition.snapSide ? `fold-shell-expanded-docked-${anchorPosition.snapSide}` : ""
					}`}
					animate={{ width: shellWidth }}
					transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.7 }}
					style={
						isProcessingFill
							? ({ "--fold-fill-progress": String(fillProgress) } as React.CSSProperties)
							: undefined
					}
					onClick={() => {
						if (collapsed && !dragMovedRef.current) setPanelOpen(true);
					}}
				>
					{isAuthPrompt && <MultiColorBorderBeam duration={5} />}

					{!inputScene && !isExecuting && !isAuthPrompt && status !== "done" && (
						<button
							type="button"
							className="fold-logo-button"
							onClick={(e) => {
								e.stopPropagation();
								if (dragMovedRef.current) return;
								if (collapsed) setPanelOpen(true);
								else if (status === "idle") setPanelOpen(false);
							}}
							aria-label={collapsed ? `打开 ${PRODUCT_NAME}` : `收起 ${PRODUCT_NAME}`}
						>
							<ZhigengLogoMark className="fold-logo-mark" size={32} mono />
						</button>
					)}

					{showCheckmark && (
						<button
							type="button"
							className="fold-logo-button"
							onClick={(e) => {
								e.stopPropagation();
								void window.fold.dismiss();
							}}
							aria-label="关闭"
						>
							<GreenCheckMark phase="done" />
						</button>
					)}

					<AnimatePresence initial={false} mode="popLayout">
						{!collapsed && !isVoiceFormattingActive && (
							<motion.div
								key={status === "idle" ? "ready" : status}
								className="fold-shell-content"
								initial={{ opacity: 0, x: -6 }}
								animate={{ opacity: 1, x: 0 }}
								exit={{ opacity: 0, x: -4 }}
								transition={{ duration: 0.16, delay: 0.06 }}
							>
								{status === "idle" && (
									<>
										<div className="min-w-0 flex-1">
											<p className="text-sm font-medium whitespace-nowrap">{PRODUCT_NAME} 准备好了</p>
											<p className="mt-1 text-xs text-white/45 whitespace-nowrap">⌥Space Agent · 右⌘ 转写/代回</p>
										</div>
										<button
											type="button"
											onClick={(e) => {
												e.stopPropagation();
												void window.fold.toggleVoice();
											}}
											className="shrink-0 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90"
										>
											开始语音
										</button>
										<IdleActionRail onOpenChange={setIdleRailOpen} />
									</>
								)}

								{status === "predict" && !isPredictCard && (
									<PredictSuggestions
										anchor={predictAnchor}
										suggestions={predictSuggestions ?? []}
										mode={predictMode}
										onRun={(intent) => void window.fold.predictPickIntent(intent)}
										onDismiss={() => void window.fold.dismiss()}
									/>
								)}

								{status === "listening" && (
									inputScene ? (
										<div className={voiceHint ? "fold-input-tab-stack" : undefined}>
											<div className="fold-input-tab-row">
												{contextAppName || contextPageUrl ? (
													<span className="fold-input-app-icon" aria-hidden="true">
								<ContextAppIcon
															appName={contextAppName}
															appPath={contextAppPath}
															pageUrl={contextPageUrl}
									size={20}
														/>
													</span>
												) : null}
												<span
													className="fold-input-mode max-w-[132px] truncate"
													title={voiceSurface}
												>
													{voiceSurface}
												</span>
							<span className="fold-input-separator" />
							<VoiceWave level={voiceLevel} />
							<button
								type="button"
								className="fold-input-close"
								onClick={(event) => {
									event.stopPropagation();
									void window.fold.toggleVoice();
								}}
								aria-label="结束并转写"
								title="结束并转写"
							>
								<X size={14} strokeWidth={2.2} />
							</button>
											</div>
											{voiceHint ? (
												<p className="fold-input-voice-hint">{voiceHint}</p>
											) : null}
										</div>
									) : (
										<>
											<VoiceWave level={voiceLevel} />
											<div className="min-w-0 flex-1">
												<p className="text-sm font-medium whitespace-nowrap">Agent 正在聆听…</p>
												{mockAsr && (
													<p className="mt-0.5 text-[10px] text-amber-300/90">Demo 语音 · Settings 填 Key 启用真 ASR</p>
												)}
											</div>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													void window.fold.toggleVoice();
												}}
												className="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-black hover:bg-white/90"
											>
												结束
											</button>
										</>
									)
								)}

								{isAgentExecuting && !inputScene && (
									<div className="fold-exec-row">
										<ProgressLine
											status={status}
											transcript={transcript}
											thinkingText={thinkingText}
											progressMessage={progressMessage}
											steps={steps}
											currentApp={currentApp}
										/>
									</div>
								)}

								{status === "done" && !inputScene && (
									<div className="flex min-w-0 flex-1 items-center gap-2">
										<button
											type="button"
											className="min-w-0 flex-1 text-left"
											onClick={(e) => {
												e.stopPropagation();
												setDetailsOpen((v) => !v);
											}}
										>
											<p className="text-sm font-medium truncate" title={compactSummary(result)}>
												{compactSummary(result)}
											</p>
										</button>
										{undoAvailable ? (
											<button
												type="button"
												className="rounded-full bg-white/15 px-2.5 py-1 text-xs text-white/90 hover:bg-white/25"
												onClick={(e) => {
													e.stopPropagation();
													void window.fold.undoLastInsert().then((response) => {
														if (!response.ok) setState({ status: "error", error: response.error ?? "撤销失败" });
													});
												}}
											>
												撤销
											</button>
										) : null}
									</div>
								)}

								{status === "error" && (
									<div className="flex min-w-0 flex-1 items-center gap-2">
										<p className="min-w-0 flex-1 truncate text-sm text-red-300" title={friendlyError(error)}>
											✕ {friendlyError(error)}
										</p>
										<div className="flex gap-1.5">
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													void window.fold.retryTask();
												}}
												className="rounded-full bg-white/15 px-2.5 py-1 text-xs text-white/90 hover:bg-white/25"
											>
												重试
											</button>
											<button
												type="button"
												onClick={(e) => {
													e.stopPropagation();
													void window.fold.dismiss();
												}}
												className="rounded-full bg-white/10 px-2.5 py-1 text-xs text-white/70 hover:bg-white/20"
											>
												关闭
											</button>
										</div>
									</div>
								)}

								{status === "ask" && askOptions && askOptions.length > 0 && (
									<AskOptions
										title={askTitle}
										message={askMessage}
										hint={askHint}
										options={askOptions}
										onSelect={(id) => void window.fold.askResponse(id)}
									/>
								)}
							</motion.div>
						)}
					</AnimatePresence>
				</motion.div>
				<AnimatePresence>
					{status === "done" && detailsOpen && (
						<motion.div
							key="done-details"
							initial={{ opacity: 0, y: -6, scale: 0.98 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: -6, scale: 0.98 }}
							transition={{ duration: 0.16 }}
							className="fold-result-popover"
							onClick={(e) => e.stopPropagation()}
						>
							<div>
								<p className="text-xs text-white/45">文本总结</p>
								<p className="mt-1 text-sm font-medium text-white/92">{compactSummary(result)}</p>
								{resultDetail && (
									<pre className="fold-result-detail mt-2">{resultDetail}</pre>
								)}
								{transcript && (
									<p className="mt-2 text-xs text-white/45 line-clamp-2">来自：{transcript}</p>
								)}
							</div>
							<div className="mt-3 border-t border-white/10 pt-3">
								<p className="mb-2 text-xs text-white/45">工具执行</p>
								<StepList steps={steps ?? []} />
							</div>
							{verificationChecks && verificationChecks.length > 0 ? (
								<div className="mt-3 border-t border-white/10 pt-3">
									<p className="mb-2 text-xs text-white/45">完成校验</p>
									<ul className="space-y-1.5 text-xs">
										{verificationChecks.map((check) => (
											<li key={check.rule} className={check.passed ? "text-emerald-300" : "text-amber-300"}>
												{check.passed ? "✓" : "!"} {check.message || check.rule}
											</li>
										))}
									</ul>
								</div>
							) : null}
						</motion.div>
					)}
				</AnimatePresence>
				<AnimatePresence>
					{collapsed && hovered && (
						<motion.div
							key="dock-menu"
							initial={{ opacity: 0, y: -4, scale: 0.96 }}
							animate={{ opacity: 1, y: 0, scale: 1 }}
							exit={{ opacity: 0, y: -4, scale: 0.96 }}
							transition={{ duration: 0.14 }}
							className={`fold-dock-menu ${
								anchorPosition.snapSide === "right"
									? "fold-dock-menu-right"
									: anchorPosition.snapSide === "left"
										? "fold-dock-menu-left"
										: ""
							}`}
						>
							<button
								type="button"
								onClick={() => void window.fold.openSettings()}
								aria-label="主页"
								title="主页"
							>
								<HomeIcon />
							</button>
							<button
								type="button"
								onClick={() => void window.fold.openSettings("settings")}
								aria-label="设置"
								title="设置"
							>
								<SettingsIcon />
							</button>
							<button
								type="button"
								onClick={() => void window.fold.quit()}
								aria-label="关闭"
								title="关闭"
							>
								<CloseIcon />
							</button>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>

			{isPredictCard && predictCardPosition && (
				<PredictConfirmCard
					x={predictCardPosition.x}
					y={predictCardPosition.y}
					phase={predictPhase}
					surface={predictSurface}
					anchor={predictAnchor}
					appName={contextAppName}
					appPath={contextAppPath}
					windowTitle={contextWindowTitle}
					refining={predictRefining}
					suggestions={predictSuggestions ?? []}
					drafts={predictDrafts}
					loading={Boolean(predictAnchor?.includes("正在"))}
					draftsLoading={predictDraftsLoading}
					selectedIntent={predictSelectedIntent}
					onPickIntent={(intent) => void window.fold.predictPickIntent(intent)}
					onInsertDraft={(text) => void window.fold.predictInsertDraft(text)}
					onReject={() => {
						void window.fold.predictFeedback({
							kind: "reject",
							surface: predictSurface,
							intent: predictSelectedIntent ?? predictSuggestions?.[0]?.intent,
							draft: predictDrafts?.[0]?.text,
							anchor: predictAnchor,
						});
						void window.fold.dismiss({ skipFeedback: true });
					}}
					onDismiss={() => void window.fold.dismiss()}
				/>
			)}

			{isStructureDraftCard && structureDraftPosition && resultDetail && (
				<StructureDraftCard
					key={transcript || resultDetail}
					x={structureDraftPosition.x}
					y={structureDraftPosition.y}
					text={resultDetail}
					appName={contextAppName}
					appPath={contextAppPath}
					pageUrl={contextPageUrl}
					onInsert={(text) => window.fold.structureInsertDraft(text, contextAppName)}
					onDismiss={() => void window.fold.dismiss()}
				/>
			)}
		</div>
	);
}
