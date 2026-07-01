/**
 * Headless E2E smoke test for Fold skills + runtime
 */
import { ContextStore } from "@fold/context";
import { runTask, type StateEmitter } from "@fold/runtime";

const samplePdf = process.argv[2];

async function main() {
	const store = new ContextStore();

	if (samplePdf) {
		store.push({
			type: "file.created",
			source: "finder",
			timestamp: Date.now(),
			data: { filePath: samplePdf, appName: "Finder" },
		});
	}

	const emit: StateEmitter = (e) => {
		console.log("[state]", e.status, e.result ?? e.error ?? "");
	};

	const result = await runTask("帮我整理刚下载的报价发给 Jason", emit, {
		getLiveContext: () => store.get(),
	});

	console.log("[result]", result.status, result.episodeId);
	if (result.status === "failed") process.exit(1);
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
