import { join } from "node:path";
import { cleanupRuns } from "./cleanup.js";
import { listTasks, loadGlobalVars } from "./config.js";
import { listRuns } from "./report.js";

const baseDir = process.argv[2];
if (!baseDir) process.exit(1);

const runsDir = join(baseDir, "runs");
const binDir = join(baseDir, ".bin");
const globalVars = loadGlobalVars(baseDir);
const allTaskConfigs = listTasks(baseDir);
const runs = listRuns(runsDir);

let cleaned = 0;
for (const t of allTaskConfigs) {
	if (t.config.cleanup) {
		const taskRuns = runs.filter((r) => r.meta.task === t.id);
		cleaned += cleanupRuns(
			taskRuns,
			t.config.cleanup,
			globalVars,
			t.config.vars ?? {},
			binDir,
			t.id,
			baseDir,
		);
	}
}

if (process.send) {
	process.send({ cleaned });
}
process.exit(0);
