import { useState } from "react";
import { ChevronDown } from "lucide-react";

const SHORTCUTS_KEY = "fold:sidebar-shortcuts-expanded";

const SHORTCUTS = [
	{ title: "转写", keys: ["右 ⌘", "短按"] },
	{ title: "代回", keys: ["右 ⌘", "按住"] },
	{ title: "Agent", keys: ["⌥", "Space"] },
] as const;

function loadExpanded(): boolean {
	try {
		const raw = localStorage.getItem(SHORTCUTS_KEY);
		if (raw === "0") return false;
		if (raw === "1") return true;
	} catch {
		// ignore
	}
	return true;
}

export function SidebarShortcuts() {
	const [expanded, setExpanded] = useState(loadExpanded);

	const toggle = () => {
		setExpanded((prev) => {
			const next = !prev;
			try {
				localStorage.setItem(SHORTCUTS_KEY, next ? "1" : "0");
			} catch {
				// ignore
			}
			return next;
		});
	};

	return (
		<div className="fold-sidebar-shortcuts">
			<button type="button" className="fold-sidebar-shortcuts-toggle" onClick={toggle}>
				<span>快捷操作</span>
				<ChevronDown
					size={14}
					strokeWidth={1.75}
					className={`fold-sidebar-shortcuts-chevron${expanded ? " is-open" : ""}`}
				/>
			</button>
			{expanded ? (
				<ul className="fold-sidebar-shortcuts-list">
					{SHORTCUTS.map((item) => (
						<li key={item.title} className="fold-sidebar-shortcut-row">
							<span className="fold-sidebar-shortcut-title">{item.title}</span>
							<span className="fold-sidebar-shortcut-keys">
								{item.keys.map((key) => (
									<kbd key={key}>{key}</kbd>
								))}
							</span>
						</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
