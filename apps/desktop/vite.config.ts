import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import electron from "vite-plugin-electron/simple";

const rootDir = dirname(fileURLToPath(import.meta.url));
const foldSrc = (name: string) => resolve(rootDir, `../../packages/${name}/src/index.ts`);

const foldAliases = {
	"@fold/ai": foldSrc("ai"),
	"@fold/connectors": foldSrc("connectors"),
	"@fold/context": foldSrc("context"),
	"@fold/memory": foldSrc("memory"),
	"@fold/runtime": foldSrc("runtime"),
	"@fold/skills": foldSrc("skills"),
};

const electronExternals = (id: string) =>
	id === "electron" ||
	id === "better-sqlite3" ||
	id === "uiohook-napi" ||
	id === "fsevents" ||
	id === "uuid" ||
	id.startsWith("playwright") ||
	id === "@playwright/mcp" ||
	id.startsWith("@modelcontextprotocol/") ||
	id.startsWith("@computer-use/") ||
	id.startsWith("@ui-tars/");

export default defineConfig({
	// react-draggable 在 handleDragStart 里访问 process.env.DRAGGABLE_DEBUG，
	// 渲染进程没有 process 全局 → ReferenceError → 拖拽静默失败
	define: {
		"process.env.DRAGGABLE_DEBUG": "false",
	},
	optimizeDeps: {
		esbuildOptions: {
			define: {
				"process.env.DRAGGABLE_DEBUG": "false",
			},
		},
	},
	build: {
		rollupOptions: {
			input: {
				main: "index.html",
				settings: "settings.html",
			},
		},
	},
	plugins: [
		react(),
		tailwindcss(),
		electron({
			main: {
				entry: "electron/main.ts",
				onstart({ startup }) {
					// Only boot Electron once — rebuilding main must not kill in-flight tasks.
					if (!(process as NodeJS.Process & { electronApp?: unknown }).electronApp) startup();
				},
				vite: {
					resolve: { alias: foldAliases },
					build: {
						outDir: "dist-electron",
						rollupOptions: {
							external: electronExternals,
						},
					},
				},
			},
			preload: {
				input: "electron/preload.ts",
				vite: {
					build: { outDir: "dist-electron" },
				},
			},
		}),
	],
	server: {
		port: 5173,
	},
	publicDir: "public",
});
