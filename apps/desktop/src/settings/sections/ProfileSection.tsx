import { useEffect, useState } from "react";
import type { EpisodeSummary, HomeSnapshot, UserProfileData } from "../types.js";
import { Card, formatTime } from "../components/FormFields.js";
import { ProfileImportModal } from "./ProfileImportModal.js";

type Habit = { label: string; count: number; example?: string };

const HABIT_CLUSTERS = [
	{ id: "voice-structure", label: "语音转写整理", pattern: /^转写：|voice\.structure|整理|润色|口述/i },
	{ id: "voice-reply", label: "代回与聊天回复", pattern: /^代回：|voice\.reply|回复|微信|飞书|slack/i },
	{ id: "mail", label: "邮件与收件箱", pattern: /mail|邮件|gmail|邮箱|未读|收件/i },
	{ id: "files", label: "文件与报价整理", pattern: /报价|pdf|下载|整理|发给|jason/i },
	{ id: "browser", label: "浏览器与网页", pattern: /chrome|网页|浏览|打开.*网|标签页/i },
	{ id: "screen", label: "屏幕读取", pattern: /屏幕|截图|ocr|界面/i },
] as const;

function clusterHabits(episodes: EpisodeSummary[], limit = 5): Habit[] {
	const clusters = new Map<string, Habit>();
	const singles = new Map<string, number>();

	for (const ep of episodes) {
		const intent = ep.intent.trim();
		if (!intent) continue;

		const cluster = HABIT_CLUSTERS.find((c) => c.pattern.test(intent));
		if (cluster) {
			const existing = clusters.get(cluster.id) ?? { label: cluster.label, count: 0 };
			existing.count += 1;
			if (!existing.example) existing.example = intent;
			clusters.set(cluster.id, existing);
			continue;
		}

		singles.set(intent, (singles.get(intent) ?? 0) + 1);
	}

	return [
		...clusters.values(),
		...[...singles.entries()].map(([label, count]) => ({ label, count })),
	]
		.sort((a, b) => b.count - a.count)
		.slice(0, limit);
}

function inferTopics(habits: Habit[]): string[] {
	const text = habits.map((h) => `${h.label} ${h.example ?? ""}`).join(" ");
	const topics: string[] = [];
	if (/mail|邮件|gmail|邮箱|收件/i.test(text)) topics.push("邮件");
	if (/转写|口述|润色|整理/i.test(text)) topics.push("转写");
	if (/代回|回复|聊天/i.test(text)) topics.push("代回");
	if (/pdf|报价|下载|文件|整理/i.test(text)) topics.push("文档");
	if (/chrome|网页|浏览/i.test(text)) topics.push("浏览器");
	if (/屏幕|截图|ocr/i.test(text)) topics.push("屏幕");
	return topics;
}

function buildProfileLine(
	episodes: EpisodeSummary[],
	habits: Habit[],
	stored?: UserProfileData | null,
): string {
	if (stored?.summary?.trim()) return stored.summary.trim();
	if (stored?.role?.trim()) {
		const domains = stored.domains?.length ? `，主要处理${stored.domains.join("、")}` : "";
		return `你是${stored.role}${domains}。`;
	}
	if (episodes.length === 0) {
		return "开始使用 Fold 后，这里会根据你的任务记录逐步形成个人画像。";
	}
	const topics = inferTopics(habits);
	if (topics.length > 0) {
		return `你主要用 Fold 处理${topics.join("、")}相关事务，习惯通过语音快速下达指令。`;
	}
	return `你已执行 ${episodes.length} 次任务，Fold 会持续从你的使用习惯中学习偏好。`;
}

function taskStats(episodes: EpisodeSummary[]) {
	let success = 0;
	let partial = 0;
	for (const ep of episodes) {
		const s = ep.status.toLowerCase();
		if (s === "success") success += 1;
		else if (s === "partial") partial += 1;
	}
	return { total: episodes.length, success, partial };
}

function statusLabel(status: string) {
	const s = status.toLowerCase();
	if (s === "success") return "成功";
	if (s === "partial") return "部分完成";
	return status;
}

export function ProfileSection({
	snapshot,
	active,
	onNavigate,
}: {
	snapshot: HomeSnapshot;
	active: boolean;
	onNavigate: (section: "tasks" | "work", taskId?: string) => void;
}) {
	const [episodes, setEpisodes] = useState<EpisodeSummary[]>([]);
	const [storedProfile, setStoredProfile] = useState<UserProfileData | null>(null);
	const [loading, setLoading] = useState(true);
	const [importOpen, setImportOpen] = useState(false);

	function reloadProfile() {
		void window.fold.profileGet().then((p) => setStoredProfile((p as UserProfileData | null) ?? null));
	}

	useEffect(() => {
		if (!active) return;
		let mounted = true;
		setLoading(true);
		void Promise.all([window.fold.listEpisodes(), window.fold.profileGet()])
			.then(([items, profile]) => {
				if (!mounted) return;
				setEpisodes(items);
				setStoredProfile((profile as UserProfileData | null) ?? null);
			})
			.finally(() => {
				if (mounted) setLoading(false);
			});
		return () => {
			mounted = false;
		};
	}, [active]);

	const habits = clusterHabits(episodes);
	const stats = taskStats(episodes);
	const topics = [
		...new Set([...inferTopics(habits), ...(storedProfile?.domains ?? [])]),
	];
	const recent = episodes[0];
	const profileTags = [
		...(storedProfile?.preferredTools ?? []),
		...(storedProfile?.workPatterns ?? []),
	].slice(0, 6);

	return (
		<div className="space-y-4">
			<Card title="个人画像">
				<div className="mb-3 flex flex-wrap items-center gap-3">
					<button type="button" className="fold-profile-action-btn primary" onClick={() => setImportOpen(true)}>
						从 AI 助手导入
					</button>
					{storedProfile?.updatedAt && (
						<span className="text-[11px] text-[#86868b]">
							上次更新 {formatTime(storedProfile.updatedAt)}
						</span>
					)}
				</div>
				{loading ? (
					<p className="text-[13px] text-[#86868b]">加载中…</p>
				) : (
					<>
						<p className="text-[13px] leading-relaxed text-[#3a3a3c]">
							{buildProfileLine(episodes, habits, storedProfile)}
						</p>
						{profileTags.length > 0 && (
							<div className="mt-3 flex flex-wrap gap-2">
								{profileTags.map((tag) => (
									<span key={tag} className="fold-home-badge">
										{tag}
									</span>
								))}
							</div>
						)}
						{topics.length > 0 && (
							<div className="mt-3 flex flex-wrap gap-2">
								{topics.map((topic) => (
									<span key={topic} className="fold-home-badge">
										{topic}
									</span>
								))}
							</div>
						)}
						{stats.total > 0 && (
							<div className="mt-3 flex flex-wrap gap-2">
								<span className="fold-home-badge">{stats.total} 次任务</span>
								{stats.success > 0 && (
									<span className="fold-home-badge fold-home-badge-ok">{stats.success} 成功</span>
								)}
								{stats.partial > 0 && (
									<span className="fold-home-badge fold-home-badge-warn">{stats.partial} 部分完成</span>
								)}
							</div>
						)}
					</>
				)}
			</Card>

			{importOpen && (
				<ProfileImportModal
					onClose={() => setImportOpen(false)}
					onSaved={() => {
						reloadProfile();
					}}
				/>
			)}

			<Card title="我的习惯">
				{loading ? (
					<p className="text-[13px] text-[#86868b]">加载中…</p>
				) : habits.length > 0 ? (
					<ul className="space-y-3">
						{habits.map((habit) => (
							<li key={habit.label}>
								<div className="flex items-start gap-2">
									<span className="fold-home-badge mt-0.5 shrink-0 tabular-nums">{habit.count} 次</span>
									<div className="min-w-0">
										<p className="text-[13px] font-medium text-[#1d1d1f]">{habit.label}</p>
										{habit.example && habit.example !== habit.label && (
											<p className="mt-0.5 line-clamp-2 text-[11px] leading-relaxed text-[#86868b]">
												例：{habit.example}
											</p>
										)}
									</div>
								</div>
							</li>
						))}
					</ul>
				) : (
					<p className="text-[13px] text-[#86868b]">完成任务后，这里会归纳你常做的事。</p>
				)}
			</Card>

			<Card title="最近动态">
				{loading ? (
					<p className="text-[13px] text-[#86868b]">加载中…</p>
				) : recent ? (
					<button
						type="button"
						onClick={() => onNavigate("tasks", recent.id)}
						className="fold-profile-recent-btn"
					>
						<p className="text-left text-[13px] font-medium leading-relaxed text-[#1d1d1f]">
							{recent.intent}
						</p>
						{recent.summary && (
							<p className="mt-1 line-clamp-2 text-left text-[13px] leading-relaxed text-[#6e6e73]">
								{recent.summary}
							</p>
						)}
						<p className="mt-1.5 text-left text-[11px] text-[#86868b]">
							{formatTime(recent.timestamp)} · {statusLabel(recent.status)}
						</p>
					</button>
				) : (
					<p className="text-[13px] text-[#86868b]">还没有任务记录。</p>
				)}
				<div className="mt-3 flex flex-wrap gap-4">
					<button type="button" onClick={() => onNavigate("tasks")} className="fold-home-link">
						查看全部任务 →
					</button>
					{snapshot.liveContext.activeApp && (
						<button type="button" onClick={() => onNavigate("work")} className="fold-home-link">
							当前在 {snapshot.liveContext.activeApp} · 看轨迹 →
						</button>
					)}
				</div>
			</Card>
		</div>
	);
}
