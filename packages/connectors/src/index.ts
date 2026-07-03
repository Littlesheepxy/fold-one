export { runShell, runAppleScript, runPython } from "./shell.js";
export {
	runSandboxedAppleScript,
	runSandboxedPython,
	runSandboxedShell,
	type SandboxedShellOptions,
} from "./sandbox.js";
export {
	createMailDraft,
	openMail,
	countMailUnread,
	openGogAuthInTerminal,
	openGwsAuthInTerminal,
	formatCliVendorMaintenanceHint,
	GMAIL_CLI_VENDORS,
	isGmailCliInstalled,
	resolveMailConnectorAsync,
	resolveMailConnector,
	detectMailConnector,
	connectorLabel,
	probeGmailCli,
	type GmailCliProbe,
	type MailDraftInput,
	type MailDraftResult,
	type MailDraftOptions,
	type MailActionOptions,
	type MailOpenResult,
	type MailCountUnreadResult,
	type MailContextHint,
	type MailProvider,
	type MailConnectorId,
} from "./mail/index.js";
export {
	connectBrowser,
	getChromeCdpUrl,
	getCurrentBrowserPage,
	probeBrowserCdp,
	withBrowserSession,
	type BrowserCdpProbe,
	type BrowserPageInfo,
	type BrowserSession,
} from "./browser/index.js";
export {
	browserInteract,
	type BrowserInteractAction,
	type BrowserInteractInput,
	type BrowserInteractResult,
} from "./browser/index.js";
export {
	executeAgent,
	isAgentSubagentsEnabled,
	listAvailableAgents,
	probeAllAgents,
	openCodexInstallInTerminal,
	openClaudeLoginInTerminal,
	type AgentId,
	type AgentProbeStatus,
	type AgentResult,
	type AgentTask,
	type SubagentHandoff,
} from "./agents/index.js";
export {
	executeUitarsTask,
	isUitarsEnabled,
	probeUitars,
	type UitarsProbe,
	type UitarsTaskInput,
	type UitarsTaskResult,
} from "./gui/index.js";
export {
	executeWorkBuddyTask,
	getWorkBuddyGatewayUrl,
	isWorkBuddyEnabled,
	probeWorkBuddyGateway,
	type WorkBuddyProbe,
	type WorkBuddyRunInput,
	type WorkBuddyRunResult,
} from "./workbuddy/index.js";
export {
	createNangoConnectLink,
	countGmailUnreadViaNango,
	createGmailDraftViaNango,
	hasNangoGmailConnection,
	isNangoConfigured,
	listNangoConnections,
	probeNango,
	type NangoConnection,
	type NangoProbe,
} from "./nango/index.js";
export {
	executeLarkMailTriage,
	probeLarkCli,
	type LarkCliProbe,
	type LarkMailTriageInput,
	type LarkMailTriageResult,
} from "./feishu/index.js";
export {
	executeSlackUnread,
	probeSlackCli,
	type SlackCliBackend,
	type SlackCliProbe,
	type SlackUnreadResult,
} from "./slack/index.js";
export {
	isOfficeChannelId,
	openOfficeSetupInTerminal,
	probeOfficeChannels,
	runOfficeCli,
	type OfficeChannelId,
	type OfficeChannelProbe,
	type OfficeCliResult,
} from "./office/index.js";
export {
	getPluginsDir,
	loadPluginManifests,
	probePlugins,
	runPluginCli,
	type PluginCliResult,
	type PluginManifest,
	type PluginProbe,
} from "./plugins/index.js";
export {
	cancelConnectFlow,
	getConnectFlowSession,
	pollConnectFlow,
	resolveConnectTarget,
	startConnectFlow,
	type ConnectFlowKind,
	type ConnectFlowPollResult,
	type ConnectFlowStart,
	type ConnectTarget,
} from "./office/auth-flow.js";
export {
	captureScreenshot,
	probeScreenCapture,
	type ScreenshotResult,
	type ScreenshotTarget,
	type ScreenCaptureProbe,
} from "./macos/index.js";
