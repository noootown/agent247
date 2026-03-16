import { join } from "node:path";
import { listRuns, type RunFilter } from "../lib/report.js";

export function statusCommand(
	baseDir: string,
	options: { all?: boolean; task?: string },
): void {
	const runsDir = join(baseDir, "runs");
	const filter: RunFilter = { reviewed: false };
	if (options.task) filter.task = options.task;
	let runs = listRuns(runsDir, filter);
	if (!options.all) {
		runs = runs.filter(
			(r) => r.meta.status !== "skipped" && r.meta.status !== "no-action",
		);
	}
	if (runs.length === 0) {
		console.log("\n  No unreviewed runs.\n");
		return;
	}
	console.log(`\n  UNREVIEWED RUNS (${runs.length})\n`);
	console.log(
		`  ${"STATUS".padEnd(12)}${"TASK".padEnd(28)}${"TIME".padEnd(20)}URL`,
	);
	console.log(`  ${"─".repeat(90)}`);
	for (const run of runs) {
		const statusIcon =
			run.meta.status === "error"
				? "✗"
				: run.meta.status === "completed"
					? "●"
					: "○";
		const time = new Date(run.meta.started_at).toLocaleString();
		const url = run.meta.url ?? "—";
		console.log(
			"  " +
				`${statusIcon} ${run.meta.status}`.padEnd(12) +
				run.meta.task.padEnd(28) +
				time.padEnd(20) +
				url,
		);
	}
	console.log(`\n  Run \`agent247 show <ulid>\` to view a report`);
	console.log(`  Run \`agent247 review <ulid>\` to mark as reviewed\n`);
}
