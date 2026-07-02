import { animate, motion, AnimatePresence, useMotionValue } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import { useOverlayStore } from "./useOverlayStore";
import { useVoiceHandlers } from "./useVoice";
import { useMousePassthrough } from "./useMousePassthrough";
import { DotMatrixLoader } from "./components/DotMatrixLoader";
import { StepList } from "./components/StepList";
import { ProgressLine } from "./components/ProgressLine";
import { TranscriptScroll } from "./components/TranscriptScroll";
import { AskOptions } from "./components/AskOptions";

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

function playExpandSound() {
	try {
		const AudioContextClass = window.AudioContext;
		const ctx = new AudioContextClass();
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();

		osc.type = "sine";
		osc.frequency.setValueAtTime(520, ctx.currentTime);
		osc.frequency.exponentialRampToValueAtTime(780, ctx.currentTime + 0.12);
		gain.gain.setValueAtTime(0.0001, ctx.currentTime);
		gain.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + 0.02);
		gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18);
		osc.connect(gain);
		gain.connect(ctx.destination);
		osc.start();
		osc.stop(ctx.currentTime + 0.2);
		setTimeout(() => void ctx.close(), 260);
	} catch {
		// Audio can be blocked until the first user gesture.
	}
}

function FoldLogo({ className = "" }: { className?: string }) {
	return (
		<svg
			className={`fold-logo-mark ${className}`}
			viewBox="0 0 32 28"
			fill="none"
			aria-hidden="true"
		>
			<path
				d="M6 7.5L16 18.5L26 7.5"
				stroke="currentColor"
				strokeWidth="8"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
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
	return result ?? "Fold 已完成任务";
}

const EDGE_GAP = 12;
const ORB_SIZE = 48;
const DOCKED_WIDTH = 78;
const PANEL_SAFE_WIDTH = 460;
const SNAP_THRESHOLD = 28;
const DOCK_PEEK = 52;

type SnapSide = "left" | "right" | null;
interface WidgetPosition {
	x: number;
	y: number;
	snapSide?: SnapSide;
}

function clampY(y: number) {
	return Math.min(Math.max(EDGE_GAP, y), window.innerHeight - ORB_SIZE - EDGE_GAP);
}

function clampDragX(x: number) {
	return Math.min(Math.max(EDGE_GAP, x), window.innerWidth - ORB_SIZE - EDGE_GAP);
}

function resolveSnapSide(x: number): SnapSide {
	if (x <= SNAP_THRESHOLD) return "left";
	if (x + ORB_SIZE >= window.innerWidth - SNAP_THRESHOLD) return "right";
	return null;
}

function dockedX(side: Exclude<SnapSide, null>) {
	return side === "left" ? -(DOCKED_WIDTH - DOCK_PEEK) : window.innerWidth - DOCK_PEEK;
}

function clampWidgetPosition(pos: WidgetPosition): WidgetPosition {
	const snapSide = pos.snapSide ?? resolveSnapSide(pos.x);
	return {
		x: snapSide ? dockedX(snapSide) : clampDragX(pos.x),
		y: clampY(pos.y),
		snapSide,
	};
}

function expandedX(anchorX: number, width: number, snapSide: SnapSide) {
	const dockInset = DOCKED_WIDTH - DOCK_PEEK;
	if (snapSide === "left") return -dockInset;
	if (snapSide === "right") return window.innerWidth - width + dockInset;
	return Math.min(Math.max(EDGE_GAP, anchorX), Math.max(EDGE_GAP, window.innerWidth - width - EDGE_GAP));
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
		error,
		askTitle,
		askMessage,
		askHint,
		askOptions,
		setState,
	} = useOverlayStore();

	const [mockAsr, setMockAsr] = useState(true);
	const [detailsOpen, setDetailsOpen] = useState(false);
	const [panelOpen, setPanelOpen] = useState(false);
	const initialPosition = useRef(
		(() => {
		if (typeof window === "undefined") return { x: 32, y: 32, snapSide: null };
		const saved = window.localStorage.getItem("fold-widget-position");
		if (saved) {
			try {
				return clampWidgetPosition(JSON.parse(saved) as WidgetPosition);
			} catch {
				// ignore corrupt localStorage
			}
		}
		return clampWidgetPosition({
			x: Math.max(24, window.innerWidth - 92),
			y: Math.max(24, window.innerHeight - 128),
		});
		})(),
	);
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

	useEffect(() => {
		void window.fold.getUseMockAsr().then(setMockAsr);
	}, []);

	useEffect(() => {
		if (prevStatusRef.current === "idle" && status !== "idle") {
			playExpandSound();
		}
		if (status !== "done") setDetailsOpen(false);
		if (status !== "idle") setPanelOpen(false);
		if (status !== "idle") setIdleRailOpen(false);
		prevStatusRef.current = status;
	}, [status]);

	useEffect(() => {
		return window.fold.onState((state) => setState(state));
	}, [setState]);

	useEffect(() => {
		const tHandler = (e: Event) => {
			const text = (e as CustomEvent<string>).detail;
			setState({ transcript: text, status: "listening" });
		};
		window.addEventListener("fold:transcript-local", tHandler);
		return () => {
			window.removeEventListener("fold:transcript-local", tHandler);
		};
	}, [setState]);

	const isExecuting = status === "understanding" || status === "planning" || status === "working";
	const isAuthPrompt = status === "ask";
	const collapsed = status === "idle" && !panelOpen;
	const dockedSide = collapsed ? anchorPosition.snapSide : null;
	const idleShellWidth = idleRailOpen ? 424 : 360;
	const shellWidth = collapsed
		? (dockedSide ? DOCKED_WIDTH : ORB_SIZE)
		: status === "error"
			? 360
			: status === "idle"
				? idleShellWidth
			: status === "working" || status === "planning" || status === "understanding"
				? 300
				: status === "done"
					? 320
				: status === "ask"
					? 400
				: status === "listening"
					? 320
					: 390;
	const expandedLeft = expandedX(anchorPosition.x, shellWidth, anchorPosition.snapSide ?? null);

	useEffect(() => {
		if (document.body.dataset.foldDragging === "true") return;
		const target = {
			x: collapsed
				? (positionRef.current.snapSide ? dockedX(positionRef.current.snapSide) : clampDragX(positionRef.current.x))
				: expandedLeft,
			y: clampY(positionRef.current.y),
			snapSide: collapsed ? positionRef.current.snapSide : positionRef.current.snapSide,
		};
		animate(x, target.x, { type: "spring", stiffness: 520, damping: 42, mass: 0.75 });
		animate(y, target.y, { type: "spring", stiffness: 520, damping: 42, mass: 0.75 });
		positionRef.current = target;
		setAnchorPosition(target);
		window.localStorage.setItem("fold-widget-position", JSON.stringify(target));
	}, [collapsed, expandedLeft, x, y, shellWidth]);

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
		const snapSide = collapsed ? resolveSnapSide(raw.x) : null;
		const next = {
			x: snapSide ? dockedX(snapSide) : clampDragX(raw.x),
			y: clampY(raw.y),
			snapSide,
		};
		animate(x, next.x, { type: "spring", stiffness: 520, damping: 38, mass: 0.8 });
		animate(y, next.y, { type: "spring", stiffness: 520, damping: 38, mass: 0.8 });
		positionRef.current = next;
		setAnchorPosition(next);
		window.localStorage.setItem("fold-widget-position", JSON.stringify(next));
		setTimeout(() => {
			dragMovedRef.current = false;
			delete document.body.dataset.foldDragging;
			window.fold.setMousePassthrough(false);
		}, 220);
	};

	return (
		<div className="fixed inset-0 pointer-events-none">
			<motion.div
				data-fold-interactive=""
				drag
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
				style={{ x, y }}
				className="absolute pointer-events-auto select-none"
			>
				<motion.div
					className={`fold-shell ${collapsed ? "fold-shell-collapsed" : ""} ${
						isExecuting ? "fold-shell-executing" : ""
					} ${
						!collapsed && (status === "error" || status === "ask") ? "fold-shell-expanded" : ""
					} ${
						!collapsed && status === "idle" ? "fold-shell-idle" : ""
					} ${
						dockedSide ? `fold-shell-docked fold-shell-docked-${dockedSide}` : ""
					} ${
						!collapsed && anchorPosition.snapSide ? `fold-shell-expanded-docked-${anchorPosition.snapSide}` : ""
					}`}
					animate={{ width: shellWidth }}
					transition={{ type: "spring", stiffness: 520, damping: 42, mass: 0.7 }}
					onClick={() => {
						if (collapsed && !dragMovedRef.current) setPanelOpen(true);
					}}
				>
					{isExecuting && <MultiColorBorderBeam />}
					{isAuthPrompt && <MultiColorBorderBeam duration={5} />}

					{!isExecuting && !isAuthPrompt && (
						<button
							type="button"
							className="fold-logo-button"
							onClick={(e) => {
								e.stopPropagation();
								if (dragMovedRef.current) return;
								if (collapsed) setPanelOpen(true);
								else if (status === "idle") setPanelOpen(false);
								else if (status === "done") void window.fold.dismiss();
							}}
							aria-label={collapsed ? "打开 Fold" : "收起 Fold"}
						>
							<FoldLogo />
						</button>
					)}

					<AnimatePresence initial={false} mode="popLayout">
						{!collapsed && (
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
											<p className="text-sm font-medium whitespace-nowrap">Fold 准备好了</p>
											<p className="mt-1 text-xs text-white/45 whitespace-nowrap">点开始语音，或按 ⌥ Space</p>
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

								{status === "listening" && (
									<>
										<div className="w-[200px]">
											<TranscriptScroll text={transcript ?? ""} placeholder="Fold 正在聆听…" />
											{mockAsr && (
												<p className="mt-1 text-[10px] text-amber-300/90">Demo 语音 · Settings 填 Key 启用真 ASR</p>
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
								)}

								{isExecuting && (
									<div className="fold-exec-row">
										<DotMatrixLoader />
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

								{status === "done" && (
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
		</div>
	);
}
