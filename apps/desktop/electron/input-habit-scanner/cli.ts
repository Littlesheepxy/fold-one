#!/usr/bin/env node
/** ponytail: one-shot CLI to run scan without Electron UI */
import { writeFileSync } from "node:fs";
import { scanInputHabits } from "./index.js";

async function main() {
	const report = await scanInputHabits();
	const json = JSON.stringify(report, null, 2);
	writeFileSync("/tmp/fold-input-habit-scan.json", json);
	console.log(json);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
