import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { detectMailConnector, isAgentSubagentsEnabled, listAvailableAgents, probeBrowserCdp, probeGmailCli, probeLarkCli, probeNango, probeOfficeChannels, probeScreenCapture, probeSlackCli, probeUitars, probeWorkBuddyGateway, resolveMailConnector } from "@fold/connectors";
import type { LiveContext } from "@fold/context";
import { listSkills } from "@fold/skills";
import { mentionsDownloads } from "./capability-resolver.js";

export type ProbeStatus = "ok" | "skipped" | "error";
export type ProbeSideEffect = "none" | "reversible" | "irreversible";

export interface ProbeResult {
	id: string;
	status: ProbeStatus;
	exclusiveResource: string;
	sideEffect: ProbeSideEffect;
	value?: unknown;
	error?: string;
}

export interface ProbeRunResult {
	probes: ProbeResult[];
}

function ok(id: string, value: unknown): ProbeResult {
	return { id, status: "ok", exclusiveResource: "none", sideEffect: "none", value };
}

function skipped(id: string, value: unknown): ProbeResult {
	return { id, status: "skipped", exclusiveResource: "none", sideEffect: "none", value };
}

function failed(id: string, error: unknown): ProbeResult {
	return {
		id,
		status: "error",
		exclusiveResource: "none",
		sideEffect: "none",
		error: (error as Error).message,
	};
}

async function runProbe(
	id: string,
	probe: () => Promise<ProbeResult> | ProbeResult,
): Promise<ProbeResult> {
	try {
		return await probe();
	} catch (error) {
		return failed(id, error);
	}
}

async function probeDownloads(intent: string): Promise<ProbeResult> {
	if (!mentionsDownloads(intent)) {
		return skipped("fs.downloads", "intent does not mention downloads/files");
	}
	const entries = await readdir(join(homedir(), "Downloads"), { withFileTypes: true });
	const pdfCount = entries.filter((entry) => entry.isFile() && /\.pdf$/i.test(entry.name)).length;
	return ok("fs.downloads", { exists: true, pdfCount });
}

export async function runProbes(intent: string, context: LiveContext): Promise<ProbeRunResult> {
	const probes = await Promise.all([
		runProbe("context.activeApp", () =>
			ok("context.activeApp", {
				activeApp: context.activeApp,
				activeWindow: context.activeWindow,
			}),
		),
		runProbe("skill.registry", () => ok("skill.registry", { skills: listSkills() })),
		runProbe("mail.available", async () => {
			const gmailCli = await probeGmailCli();
			const mailContext = {
				activeApp: context.activeApp,
				activeWindow: context.activeWindow,
				recentUrls: context.recentUrls,
				intent,
			};
			return ok("mail.available", {
				configured: process.env.FOLD_MAIL_PROVIDER ?? "auto",
				detected: detectMailConnector(mailContext),
				readProvider: resolveMailConnector(undefined, mailContext),
				gmailCli,
			});
		}),
		runProbe("gmail.cli", async () => ok("gmail.cli", await probeGmailCli())),
		runProbe("nango.available", async () => ok("nango.available", await probeNango())),
		runProbe("feishu.available", async () => ok("feishu.available", await probeLarkCli())),
		runProbe("slack.available", async () => ok("slack.available", await probeSlackCli())),
		runProbe("office.channels", async () => {
			const channels = await probeOfficeChannels();
			return ok(
				"office.channels",
				channels.map((c) => ({
					id: c.id,
					installed: c.installed,
					authed: c.authed,
					error: c.error,
				})),
			);
		}),
		runProbe("browser.cdp", async () => ok("browser.cdp", await probeBrowserCdp())),
		runProbe("screen.capture", async () => ok("screen.capture", await probeScreenCapture())),
		runProbe("browser.mailPage", async () => {
			const contextUrl =
				context.recentUrls.find((u) => /mail\.google\.com|outlook\./i.test(u.url))?.url ?? null;
			const cdp = await probeBrowserCdp();
			return ok("browser.mailPage", {
				contextUrl,
				cdpConnected: cdp.connected,
				cdpMailUrl: cdp.mailUrl,
				url: cdp.mailUrl ?? contextUrl,
			});
		}),
		runProbe("fs.downloads", () => probeDownloads(intent)),
		runProbe("agent.available", async () => {
			const enabled = isAgentSubagentsEnabled();
			const agents = enabled ? await listAvailableAgents() : [];
			return ok("agent.available", {
				enabled,
				agents,
				preferred: agents[0] ?? null,
			});
		}),
		runProbe("uitars.available", async () => ok("uitars.available", await probeUitars())),
		runProbe("workbuddy.available", async () => ok("workbuddy.available", await probeWorkBuddyGateway())),
	]);
	return { probes };
}

export function formatProbeSummary(result: ProbeRunResult): string {
	return result.probes
		.map((probe) => {
			const payload =
				probe.status === "error"
					? probe.error
					: typeof probe.value === "string"
						? probe.value
						: JSON.stringify(probe.value);
			return `- ${probe.id}: ${probe.status} ${payload ?? ""}`;
		})
		.join("\n");
}
