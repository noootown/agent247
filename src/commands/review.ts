import { join } from "node:path";
import { findRunDir, readRun, updateRunMeta } from "../lib/report.js";

export function reviewCommand(ulid: string, baseDir: string): void {
	const runsDir = join(baseDir, "runs");
	const runDir = findRunDir(runsDir, ulid);
	if (!runDir) {
		console.error(`Run not found: ${ulid}`);
		process.exit(1);
	}
	updateRunMeta(runDir, { reviewed: true });
	const run = readRun(runDir);
	console.log(`Marked ${ulid} as reviewed (task: ${run.meta.task})`);
}
