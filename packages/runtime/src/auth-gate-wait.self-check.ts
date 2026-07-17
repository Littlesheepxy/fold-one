/**
 * Auth-gate auto-poll self-check.
 * Run: pnpm exec tsx packages/runtime/src/auth-gate-wait.self-check.ts
 */
import { waitWithAutoPoll } from "./auth-gate.js";

function assert(cond: unknown, msg: string): asserts cond {
	if (!cond) throw new Error(msg);
}

async function main() {
	// 1) auto-resolve when ready
	let pendingResolve: ((id: string) => void) | null = null;
	let resolvedByAuto = false;
	const ask1 = new Promise<string>((resolve) => {
		pendingResolve = resolve;
	});
	const choice1 = await waitWithAutoPoll({
		requestUserAction: async () => ask1,
		resolveUserAction: (optionId) => {
			resolvedByAuto = true;
			pendingResolve?.(optionId);
		},
		req: {
			title: "t",
			message: "m",
			options: [
				{ id: "x:poll-done", label: "done" },
				{ id: "cancel", label: "取消" },
			],
		},
		readyOptionId: "x:poll-done",
		isReady: async () => true,
		intervalMs: 50,
		timeoutMs: 2_000,
	});
	assert(choice1 === "x:poll-done", `expected auto poll-done, got ${choice1}`);
	assert(resolvedByAuto, "resolveUserAction should fire");

	// 2) user cancel wins before ready
	let ready = false;
	setTimeout(() => {
		ready = true;
	}, 5_000);
	const choice2 = waitWithAutoPoll({
		requestUserAction: async () => "cancel",
		resolveUserAction: () => {
			throw new Error("should not auto-resolve after cancel");
		},
		req: {
			title: "t",
			message: "m",
			options: [
				{ id: "x:poll-done", label: "done" },
				{ id: "cancel", label: "取消" },
			],
		},
		readyOptionId: "x:poll-done",
		isReady: async () => ready,
		intervalMs: 50,
		timeoutMs: 500,
	});
	await assertRejects(choice2, /用户取消了授权/);

	console.log("auth-gate-wait self-check passed");
}

async function assertRejects(p: Promise<unknown>, re: RegExp): Promise<void> {
	try {
		await p;
		throw new Error("expected rejection");
	} catch (e) {
		assert(re.test((e as Error).message), `expected ${re}, got ${(e as Error).message}`);
	}
}

main().catch((e) => {
	console.error(e);
	process.exit(1);
});
