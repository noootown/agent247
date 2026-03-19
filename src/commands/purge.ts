import { rmSync } from "node:fs";
import { join } from "node:path";
import { purgeBin } from "../lib/bin.js";
import { listRuns } from "../lib/report.js";

function parseDuration(duration: string): number {
	const match = duration.match(/^(\d+)(d|h|m)$/);
	if (!match)
		throw new Error(`Invalid duration: ${duration}. Use format: 7d, 24h, 30m`);
	const value = parseInt(match[1], 10);
	const unit = match[2];
	switch (unit) {
		case "d":
			return value * 86400 * 1000;
		case "h":
			return value * 3600 * 1000;
		case "m":
			return value * 60 * 1000;
		default:
			throw new Error(`Unknown unit: ${unit}`);
	}
}

export function purgeCommand(baseDir: string, duration: string): void {
	const runsDir = join(baseDir, "runs");
	const maxAge = parseDuration(duration);
	const cutoff = Date.now() - maxAge;
	let runs = listRuns(runsDir);
	runs = runs.filter((r) => Date.parse(r.meta.started_at) < cutoff);
	if (runs.length === 0) {
		console.log("No runs matching criteria to clean.");
	} else {
		for (const run of runs) {
			rmSync(run.dir, { recursive: true, force: true });
		}
		console.log(`Cleaned ${runs.length} run(s).`);
	}

	const binCleaned = purgeBin(baseDir);
	if (binCleaned > 0) {
		console.log(`Purged ${binCleaned} deleted run(s) from bin.`);
	}
}
