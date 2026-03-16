import { existsSync } from "node:fs";
import { join } from "node:path";
import { readRun, updateRunMeta } from "../lib/report.js";

export function reviewCommand(ulid: string, baseDir: string): void {
	const runDir = join(baseDir, "runs", ulid);
	if (!existsSync(runDir)) {
		console.error(`Run not found: ${ulid}`);
		process.exit(1);
	}
	updateRunMeta(runDir, { reviewed: true });
	const run = readRun(runDir);
	console.log(`Marked ${ulid} as reviewed (task: ${run.meta.task})`);
}
