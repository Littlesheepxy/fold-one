/** Gmail CLI vendor metadata — for capability brief + maintenance checks. */
export interface CliVendorInfo {
	id: string;
	name: string;
	binary: string;
	repo: string;
	install: string;
	auth: string;
	/** Shell one-liner to verify install + auth (run manually or in diagnostics). */
	healthCheck: string;
}

export const GMAIL_CLI_VENDORS: CliVendorInfo[] = [
	{
		id: "gog",
		name: "gog (gogcli)",
		binary: "gog",
		repo: "https://github.com/openclaw/gogcli",
		install: "brew install gogcli",
		auth: "gog auth add <email>",
		healthCheck: 'gog auth list && gog gmail search "is:unread" --max 1 --json',
	},
	{
		id: "gws",
		name: "gws (Google Workspace CLI)",
		binary: "gws",
		repo: "https://github.com/googleworkspace/cli",
		install: "npm install -g @googleworkspace/cli",
		auth: "gws auth setup && gws auth login -s gmail",
		healthCheck: "gws auth status",
	},
];

/**
 * How to judge if a CLI is "well maintained" (run locally):
 * - gh repo view <owner/repo> --json stargazerCount,pushedAt,description
 * - gh release list --repo <owner/repo> --limit 5
 * - gh issue list --repo <owner/repo> --state open --limit 10
 */
export function formatCliVendorMaintenanceHint(): string {
	return GMAIL_CLI_VENDORS.map(
		(v) =>
			`  · ${v.name}: ${v.repo}\n    安装 ${v.install} · 健康检查 \`${v.healthCheck}\``,
	).join("\n");
}
