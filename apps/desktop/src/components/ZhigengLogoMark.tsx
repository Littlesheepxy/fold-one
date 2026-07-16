import { MARK_ASSET, OVERLAY_MARK_ASSET } from "../brand/constants.js";

export function ZhigengLogoMark({
	size = 24,
	className = "",
	mono = false,
}: {
	size?: number;
	className?: string;
	/** 悬浮球/深色底用白色剪影 */
	mono?: boolean;
}) {
	return (
		<img
			src={mono ? OVERLAY_MARK_ASSET : MARK_ASSET}
			alt=""
			width={size}
			height={size}
			className={className}
			draggable={false}
			aria-hidden="true"
		/>
	);
}

/** @deprecated use ZhigengLogoMark */
export { ZhigengLogoMark as FoldLogoMark };
