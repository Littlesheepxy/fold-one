import type { HomeSection } from "../types.js";
import {
	History,
	Home,
	Link2,
	ListChecks,
	Settings,
	CircleUserRound,
	UserRound,
	type LucideIcon,
} from "lucide-react";

const NAV_ICONS: Record<HomeSection, LucideIcon> = {
	overview: Home,
	profile: UserRound,
	work: History,
	tasks: ListChecks,
	connections: Link2,
	settings: Settings,
	account: CircleUserRound,
};

export function NavIcon({ section, className }: { section: HomeSection; className?: string }) {
	const Icon = NAV_ICONS[section];
	return <Icon className={className} size={16} strokeWidth={1.75} />;
}
