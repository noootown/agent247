import { execSync, fork } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import type { RunRecord } from "./report.js";
import { render } from "./template.js";

export function parseRetain(retain?: string): number {
	if (!retain) return 0;
	const match = retain.match(/^(\d+)(d|h|m)$/);
	if (!match) return 0;
	const value = Number(match[1]);
	switch (match[2]) {
		case "d":
			return value * 86400 * 1000;
		case "h":
			return value * 3600 * 1000;
		case "m":
			return value * 60 * 1000;
		default:
			return 0;
	}
}

export interface CleanupConfig {
	check?: string;
	when?: string;
	retain?: string;
	teardown?: string;
}

/**
 * Move a run directory to .bin and execute teardown command if configured.
 * Shared by automatic cleanup and manual soft-delete from TUI.
 */
export function archiveRun(
	runDir: string,
	binDir: string,
	taskId: string,
	teardownCmd?: string,
	globalVars: Record<string, string> = {},
	taskVars: Record<string, string> = {},
	itemVars: Record<string, string> = {},
	cwd?: string,
): void {
	// Render teardown BEFORE move (vars.json still at original path)
	let renderedTeardown: string | undefined;
	if (teardownCmd) {
		renderedTeardown = render(teardownCmd, globalVars, taskVars, itemVars);
	}

	// Move to .bin
	const parts = runDir.split("/");
	const runId = parts[parts.length - 1];
	const dest = join(binDir, taskId, runId);
	mkdirSync(join(binDir, taskId), { recursive: true });
	renameSync(runDir, dest);

	// Execute teardown AFTER move
	if (renderedTeardown) {
		try {
			execSync(renderedTeardown, {
				encoding: "utf-8",
				timeout: 60_000,
				shell: "/bin/bash",
				cwd,
			});
		} catch {
			// Teardown failed — run is already in .bin, continue
		}
	}
}

export function cleanupRuns(
	runs: RunRecord[],
	cleanupConfig: CleanupConfig,
	globalVars: Record<string, string>,
	taskVars: Record<string, string>,
	binDir: string,
	taskId: string,
	baseDir?: string,
): number {
	const retainMs = parseRetain(cleanupConfig.retain);
	const now = Date.now();
	let cleaned = 0;

	for (const run of runs) {
		if (
			run.meta.status !== "completed" &&
			run.meta.status !== "error" &&
			run.meta.status !== "canceled"
		)
			continue;
		if (retainMs > 0 && now - Date.parse(run.meta.finished_at) < retainMs)
			continue;
		try {
			let itemVars: Record<string, string> = {};
			const itemJsonPath = join(run.dir, "vars.json");
			if (existsSync(itemJsonPath)) {
				try {
					itemVars = JSON.parse(readFileSync(itemJsonPath, "utf-8"));
				} catch {}
			}
			if (run.meta.url) itemVars.url = run.meta.url;
			if (run.meta.item_key) itemVars.item_key = run.meta.item_key;

			let eligible = true;
			if (cleanupConfig.check && cleanupConfig.when) {
				const cleanupPattern = new RegExp(cleanupConfig.when);
				const checkCmd = render(
					cleanupConfig.check,
					globalVars,
					taskVars,
					itemVars,
				);
				const output = execSync(checkCmd, {
					encoding: "utf-8",
					timeout: 15_000,
					shell: "/bin/bash",
					cwd: baseDir,
				}).trim();
				eligible = cleanupPattern.test(output);
			}

			if (eligible) {
				archiveRun(
					run.dir,
					binDir,
					taskId,
					cleanupConfig.teardown,
					globalVars,
					taskVars,
					itemVars,
					baseDir,
				);
				cleaned++;
			}
		} catch {
			// Cleanup check failed — skip silently
		}
	}
	return cleaned;
}

/**
 * Run cleanup in a forked child process so it doesn't block the event loop.
 * Calls `onDone` with the number of cleaned runs when finished.
 */
export function cleanupRunsAsync(
	baseDir: string,
	onDone: (cleaned: number) => void,
): void {
	const workerPath = fileURLToPath(
		new URL("cleanup-worker.js", import.meta.url),
	);
	const child = fork(workerPath, [baseDir], { stdio: "ignore" });
	child.on("message", (msg: unknown) => {
		const { cleaned } = msg as { cleaned: number };
		onDone(cleaned);
	});
	child.on("error", () => onDone(0));
	child.on("exit", () => {});
}
