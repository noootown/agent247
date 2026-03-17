import { execSync } from "node:child_process";
import { listRuns, updateRunMeta } from "./report.js";
import { render } from "./template.js";

export interface LifecycleConfig {
	auto_resolve: boolean;
	resolve_command: string;
	resolve_when: string;
}

export interface LifecycleResult {
	resolvedCount: number;
	invalidatedKeys: Set<string>;
}

/**
 * Two-way lifecycle check:
 * 1. pending runs where external state matches resolve_when → completed
 * 2. completed runs where external state does NOT match → invalidated (allows re-processing)
 * 3. error runs where external state matches → completed (externally resolved)
 */
export function processLifecycle(
	runsDir: string,
	taskId: string,
	lifecycle: LifecycleConfig,
): LifecycleResult {
	const result: LifecycleResult = {
		resolvedCount: 0,
		invalidatedKeys: new Set(),
	};
	if (!lifecycle.auto_resolve) return result;

	const runs = listRuns(runsDir, { task: taskId });
	const pattern = new RegExp(lifecycle.resolve_when);

	for (const run of runs) {
		if (run.meta.status === "skipped") continue;
		if (!run.meta.item_key) continue;

		let matches: boolean;
		try {
			const itemVars: Record<string, string> = {};
			if (run.meta.url) itemVars.url = run.meta.url;
			if (run.meta.item_key) itemVars.item_key = run.meta.item_key;

			const command = render(lifecycle.resolve_command, {}, {}, itemVars);
			const output = execSync(command, {
				encoding: "utf-8",
				timeout: 15_000,
				shell: "/bin/bash",
			}).trim();

			matches = pattern.test(output);
		} catch {
			continue;
		}

		if (run.meta.status === "completed" && !matches) {
			// External state reverted → allow re-processing
			result.invalidatedKeys.add(run.meta.item_key);
		} else if (run.meta.status === "pending" && matches) {
			// Externally resolved → mark completed
			updateRunMeta(run.dir, { status: "completed" });
			result.resolvedCount++;
		} else if (run.meta.status === "error" && matches) {
			// Error run but externally resolved → mark completed
			updateRunMeta(run.dir, { status: "completed" });
			result.resolvedCount++;
		}
	}

	return result;
}
