/**
 * Static Mac keyboard illustration — layout & styling adapted from
 * Aceternity UI Keyboard (https://ui.aceternity.com/components/keyboard).
 * Illustration block: https://ui.aceternity.com/blocks/illustrations/keyboard-illustration
 */

function cn(...parts: (string | false | undefined)[]) {
	return parts.filter(Boolean).join(" ");
}

function Row({ children, className }: { children: React.ReactNode; className?: string }) {
	return <div className={cn("mb-[2px] flex w-full shrink-0 gap-[2px]", className)}>{children}</div>;
}

const keyFace =
	"rounded-[3.5px] bg-gray-100 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.5),0px_1px_1px_0px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(255,255,255,1)_inset]";

function ArrowGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 12 12" fill="none" className={className} aria-hidden="true">
			<path
				d="M3 6h5.5M7.2 3.8 10 6 7.2 8.2"
				stroke="currentColor"
				strokeWidth="1.35"
				strokeLinecap="round"
				strokeLinejoin="round"
			/>
		</svg>
	);
}

function ArrowCluster() {
	return (
		<div className="flex h-6 w-[5rem] shrink-0 items-end gap-[3px]">
			<div className={cn("flex h-6 w-6 items-center justify-center text-[5px] text-neutral-700", keyFace)}>
				←
			</div>
			<div className="flex h-6 w-6 flex-col gap-[3px]">
				<div className={cn("flex h-[10.5px] w-6 items-center justify-center text-[5px] text-neutral-700", keyFace)}>
					↑
				</div>
				<div className={cn("flex h-[10.5px] w-6 items-center justify-center text-[5px] text-neutral-700", keyFace)}>
					↓
				</div>
			</div>
			<KeyCap containerClassName="rounded-br-xl" className="rounded-br-lg">
				<ArrowGlyph className="h-[7px] w-[7px]" />
			</KeyCap>
		</div>
	);
}

function GlobeGlyph({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
			<circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.8" />
			<path
				d="M4 12h16M12 3.5c2.2 2.8 2.2 14.2 0 17M12 3.5c-2.2 2.8-2.2 14.2 0 17"
				stroke="currentColor"
				strokeWidth="1.4"
			/>
		</svg>
	);
}

function OptionGlyph({ className }: { className?: string }) {
	return (
		<svg fill="none" viewBox="0 0 32 32" className={className} aria-hidden="true">
			<rect stroke="currentColor" strokeWidth={2} x="18" y="5" width="10" height="2" />
			<polygon
				stroke="currentColor"
				strokeWidth={2}
				points="10.6,5 4,5 4,7 9.4,7 18.4,27 28,27 28,25 19.6,25"
			/>
		</svg>
	);
}

function KeyCap({
	className,
	containerClassName,
	childrenClassName,
	children,
	active,
}: {
	className?: string;
	containerClassName?: string;
	childrenClassName?: string;
	children?: React.ReactNode;
	active?: boolean;
}) {
	return (
		<div className={cn("rounded-[4px] p-[0.5px]", containerClassName)}>
			<div
				className={cn(
					"flex h-6 w-6 items-center justify-center rounded-[3.5px] bg-gray-100 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.5),0px_1px_1px_0px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(255,255,255,1)_inset] transition-all duration-150",
					active &&
						"bg-sky-100 shadow-[0_0_10px_rgba(56,189,248,0.55),0px_0px_1px_0px_rgba(0,0,0,0.5),0px_1px_1px_0px_rgba(0,0,0,0.1)] ring-1 ring-sky-300/80",
					className,
				)}
			>
				<div
					className={cn(
						"flex h-full w-full flex-col items-center justify-center text-[5px] text-neutral-700",
						active && "text-sky-900",
						childrenClassName,
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}

function ModKey({
	width = "w-6",
	className,
	containerClassName,
	children,
	active,
	elevated,
	wide,
}: {
	width?: "w-6" | "w-8";
	className?: string;
	containerClassName?: string;
	children?: React.ReactNode;
	active?: boolean;
	/** 等比放大浮起，不占更宽槽位 */
	elevated?: boolean;
	/** 已是宽键帽时缩小 scale，避免挤占方向键区 */
	wide?: boolean;
}) {
	const elevatedScale = wide ? "scale-[1.08]" : "scale-[1.22]";
	const activeScale = wide ? "scale-[1.12]" : "scale-[1.28]";
	return (
		<div className={cn("rounded-[4px] p-[0.5px]", containerClassName, elevated && "relative z-10")}>
			<div
				className={cn(
					"flex h-6 items-center justify-center rounded-[3.5px] bg-gray-100 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.5),0px_1px_1px_0px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(255,255,255,1)_inset] transition-all duration-150",
					width,
					className,
					elevated &&
						cn(
							"-translate-y-[3px] border-[1.5px] border-neutral-800 shadow-[0_8px_18px_rgba(0,0,0,0.14)]",
							elevatedScale,
						),
					active &&
						cn(
							"-translate-y-[4px] bg-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.55),0_10px_22px_rgba(0,0,0,0.12)] ring-1 ring-sky-300/80 border-sky-500",
							activeScale,
						),
				)}
			>
				<div
					className={cn(
						"flex h-full w-full flex-col items-start justify-between p-1 text-[5px] text-neutral-700",
						active && "text-sky-900",
					)}
				>
					{children}
				</div>
			</div>
		</div>
	);
}

/** 小修饰键槽位：等比浮起，键帽仍 w-6 */
function ModKeySlot({
	active,
	preview,
	children,
}: {
	active?: boolean;
	preview?: boolean;
	children: React.ReactNode;
}) {
	return (
		<div className="flex h-6 w-6 shrink-0 items-center justify-center overflow-visible">
			<ModKey elevated={preview || active} active={active}>
				{children}
			</ModKey>
		</div>
	);
}

function CmdKeySlot({ active, preview }: { active?: boolean; preview?: boolean }) {
	return (
		<ModKey width="w-8" wide elevated={preview || active} active={active}>
			<span className="text-[6px] leading-none">⌘</span>
			<span>cmd</span>
		</ModKey>
	);
}

function OptKeySlot({ active, preview }: { active?: boolean; preview?: boolean }) {
	return (
		<ModKeySlot active={active} preview={preview}>
			<OptionGlyph className="h-[6px] w-[6px]" />
			<span>opt</span>
		</ModKeySlot>
	);
}

function SpaceBarSlot({ active, preview }: { active?: boolean; preview?: boolean }) {
	const elevated = preview || active;
	return (
		<div
			className={cn(
				"h-6 w-[8.2rem] shrink-0 rounded-[4px] p-[0.5px]",
				elevated && "relative z-10",
			)}
		>
			<div
				className={cn(
					"flex h-6 w-full items-center justify-center rounded-[3.5px] bg-gray-100 shadow-[0px_0px_1px_0px_rgba(0,0,0,0.5),0px_1px_1px_0px_rgba(0,0,0,0.1),0px_1px_0px_0px_rgba(255,255,255,1)_inset] transition-all duration-150",
					elevated &&
						"-translate-y-[3px] border-[1.5px] border-neutral-800 shadow-[0_8px_18px_rgba(0,0,0,0.14)] scale-[1.06]",
					active &&
						"-translate-y-[4px] bg-sky-100 shadow-[0_0_12px_rgba(56,189,248,0.55),0_10px_22px_rgba(0,0,0,0.12)] ring-1 ring-sky-300/80 border-sky-500 scale-[1.1]",
				)}
			/>
		</div>
	);
}

export type HotkeyVisualTarget = "right-cmd" | "alt-space" | "esc";

function Keypad({
	target,
	pressed,
	preview,
}: {
	target?: HotkeyVisualTarget | null;
	pressed: boolean;
	preview?: boolean;
}) {
	const showRightCmd = target === "right-cmd";
	const showAltSpace = target === "alt-space";
	const showEsc = target === "esc";
	const rightCmdActive = showRightCmd && pressed;
	const rightCmdPreview = showRightCmd && !!preview && !pressed;
	const altActive = showAltSpace && pressed;
	const altPreview = showAltSpace && !!preview && !pressed;
	const spaceActive = showAltSpace && pressed;
	const spacePreview = showAltSpace && !!preview && !pressed;
	const escActive = showEsc && pressed;
	const escPreview = showEsc && !!preview && !pressed;
	const letters = (row: string) =>
		row.split(" ").map((letter) => (
			<KeyCap key={letter}>
				<span>{letter}</span>
			</KeyCap>
		));

	return (
		<div className="h-full w-fit rounded-xl bg-neutral-200 p-1 shadow-sm ring-1 shadow-black/5 ring-black/5">
			<Row>
				<KeyCap
					containerClassName="rounded-tl-xl"
					className={cn(
						"w-10 rounded-tl-lg transition-all duration-150",
						(escPreview || escActive) && "-translate-y-[3px] scale-[1.08]",
					)}
					active={escActive}
					childrenClassName="items-start justify-end pb-[2px] pl-[4px]"
				>
					<span>esc</span>
				</KeyCap>
				{["F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12"].map((f) => (
					<KeyCap key={f}>
						<span>{f}</span>
					</KeyCap>
				))}
				<KeyCap containerClassName="rounded-tr-xl" className="rounded-tr-lg">
					<div className="h-4 w-4 rounded-full bg-gradient-to-b from-neutral-300 via-neutral-200 to-neutral-300 p-px">
						<div className="h-full w-full rounded-full bg-neutral-100" />
					</div>
				</KeyCap>
			</Row>

			<Row>
				{["~", "1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="].map((k) => (
					<KeyCap key={k}>
						<span>{k}</span>
					</KeyCap>
				))}
				<KeyCap className="w-10" childrenClassName="items-end justify-end pr-[4px] pb-[2px]">
					<span>delete</span>
				</KeyCap>
			</Row>

			<Row>
				<KeyCap className="w-10" childrenClassName="items-start justify-end pb-[2px] pl-[4px]">
					<span>tab</span>
				</KeyCap>
				{letters("Q W E R T Y U I O P")}
				<KeyCap>
					<span>[</span>
				</KeyCap>
				<KeyCap>
					<span>]</span>
				</KeyCap>
				<KeyCap>
					<span>\</span>
				</KeyCap>
			</Row>

			<Row>
				<KeyCap className="w-[2.8rem]" childrenClassName="items-start justify-end pb-[2px] pl-[4px]">
					<span>caps</span>
				</KeyCap>
				{letters("A S D F G H J K L")}
				<KeyCap>
					<span>;</span>
				</KeyCap>
				<KeyCap>
					<span>'</span>
				</KeyCap>
				<KeyCap className="w-[2.85rem]" childrenClassName="items-end justify-end pr-[4px] pb-[2px]">
					<span>return</span>
				</KeyCap>
			</Row>

			<Row>
				<KeyCap className="w-[3.65rem]" childrenClassName="items-start justify-end pb-[2px] pl-[4px]">
					<span>shift</span>
				</KeyCap>
				{letters("Z X C V B N M")}
				<KeyCap>
					<span>,</span>
				</KeyCap>
				<KeyCap>
					<span>.</span>
				</KeyCap>
				<KeyCap>
					<span>/</span>
				</KeyCap>
				<KeyCap className="w-[3.65rem]" childrenClassName="items-end justify-end pr-[4px] pb-[2px]">
					<span>shift</span>
				</KeyCap>
			</Row>

			<Row className="items-end">
				<ModKey containerClassName="rounded-bl-xl" className="rounded-bl-lg">
					<span>fn</span>
					<GlobeGlyph className="h-[6px] w-[6px]" />
				</ModKey>
				<ModKey>
					<span>^</span>
					<span>ctrl</span>
				</ModKey>
				<OptKeySlot active={altActive} preview={altPreview} />
				<ModKey width="w-8">
					<span className="text-[6px] leading-none">⌘</span>
					<span>cmd</span>
				</ModKey>
				<SpaceBarSlot active={spaceActive} preview={spacePreview} />
				<CmdKeySlot active={rightCmdActive} preview={rightCmdPreview} />
				<ModKey>
					<OptionGlyph className="h-[6px] w-[6px]" />
					<span>opt</span>
				</ModKey>
				<ArrowCluster />
			</Row>
		</div>
	);
}

export function KeyboardHotkeyVisual({
	target = "right-cmd",
	pressed = false,
	preview = false,
	size = "md",
}: {
	target?: HotkeyVisualTarget | null;
	pressed?: boolean;
	/** 未按下时仍浮起目标键（总结页选中卡片用） */
	preview?: boolean;
	size?: "sm" | "md" | "lg";
}) {
	const zoom =
		size === "sm" ? "[zoom:0.85]" : size === "lg" ? "[zoom:1.35]" : "[zoom:1.15]";

	return (
		<div className={cn("fold-onboarding-keyboard mx-auto w-fit", zoom)} aria-hidden="true">
			<Keypad target={target} pressed={pressed} preview={preview} />
		</div>
	);
}
