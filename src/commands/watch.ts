import { join } from "node:path";
import { listRuns } from "../lib/report.js";

export function watchCommand(baseDir: string): void {
	const runsDir = join(baseDir, "runs");

	const render = () => {
		process.stdout.write("\x1B[2J\x1B[H");
		const runs = listRuns(runsDir, { reviewed: false }).filter(
			(r) => r.meta.status !== "skipped",
		);
		const errors = runs.filter((r) => r.meta.status === "error").length;
		const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
		const lastRunAgo = lastRun
			? formatAgo(Date.parse(lastRun.meta.started_at))
			: "never";
		console.log(
			`\n  agent247 — ${runs.length} unreviewed · ${errors} error · last run ${lastRunAgo}        ↻ 5s\n`,
		);
		if (runs.length === 0) {
			console.log("  All caught up!\n");
			return;
		}
		console.log(
			"  " +
				"STATUS".padEnd(14) +
				"TASK".padEnd(28) +
				"TIME".padEnd(14) +
				"URL",
		);
		console.log(`  ${"─".repeat(90)}`);
		for (const run of runs) {
			const icon =
				run.meta.status === "error"
					? "✗"
					: run.meta.status === "pending"
						? "◎"
						: run.meta.status === "completed"
							? "●"
							: "○";
			const time = new Date(run.meta.started_at).toLocaleTimeString("en-US", {
				hour: "2-digit",
				minute: "2-digit",
				hour12: false,
			});
			const url = run.meta.url ?? "—";
			console.log(
				"  " +
					`${icon} ${run.meta.status}`.padEnd(14) +
					run.meta.task.padEnd(28) +
					time.padEnd(14) +
					url,
			);
		}
		console.log();
	};

	render();
	const interval = setInterval(render, 5000);
	process.on("SIGINT", () => {
		clearInterval(interval);
		process.exit(0);
	});
}

function formatAgo(timestamp: number): string {
	const diff = Math.round((Date.now() - timestamp) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
	return `${Math.round(diff / 86400)}d ago`;
}
