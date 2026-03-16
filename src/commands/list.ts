import { listTasks, loadEnv } from "../lib/config.js";
import { listRuns } from "../lib/report.js";
import { join } from "node:path";

export function listCommand(baseDir: string): void {
  loadEnv(baseDir);
  const tasks = listTasks(baseDir);
  if (tasks.length === 0) {
    console.log("No tasks defined. Create a task folder under tasks/");
    return;
  }
  console.log(`\n  TASKS (${tasks.length})\n`);
  console.log("  " + "NAME".padEnd(30) + "SCHEDULE".padEnd(22) + "ENABLED".padEnd(10) + "LAST RUN");
  console.log("  " + "─".repeat(80));
  for (const { id, config } of tasks) {
    const runs = listRuns(join(baseDir, "runs"), { task: id });
    const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
    const lastRunTime = lastRun ? new Date(lastRun.meta.started_at).toLocaleString() : "never";
    console.log("  " + id.padEnd(30) + config.schedule.padEnd(22) + (config.enabled ? "yes" : "no").padEnd(10) + lastRunTime);
  }
  console.log();
}
