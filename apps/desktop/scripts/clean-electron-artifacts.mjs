import { existsSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "../dist-electron");

for (const file of ["tray.js", "config.js", "hotkey.js"]) {
	rmSync(join(outDir, file), { force: true });
}

const mainPath = join(outDir, "main.js");
if (existsSync(mainPath)) {
	const main = readFileSync(mainPath, "utf8");
	if (main.includes("@fold/context") || main.includes("@fold/runtime")) {
		console.warn(
			"[fold] dist-electron/main.js looks like stale tsc output — run `pnpm build` in apps/desktop",
		);
	}
}
