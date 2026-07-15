import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { NextConfig } from "next";

const workspaceRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const nextConfig: NextConfig = {
	reactStrictMode: true,
	turbopack: {
		root: workspaceRoot,
	},
};

export default nextConfig;
