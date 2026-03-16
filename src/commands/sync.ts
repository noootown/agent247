import { join } from "node:path";
import { listTasks, loadEnv } from "../lib/config.js";
import { syncCrontab } from "../lib/crontab.js";

export function syncCommand(baseDir: string): void {
  loadEnv(baseDir);
  const tasks = listTasks(baseDir);
  const enabledTasks = tasks
    .filter((t) => t.config.enabled)
    .map((t) => ({ id: t.id, name: t.config.name, schedule: t.config.schedule }));

  if (enabledTasks.length === 0) {
    console.log("No enabled tasks to sync.");
    return;
  }

  const binPath = process.argv[1] ?? join(baseDir, "dist", "cli.js");
  const runsDir = join(baseDir, "runs");

  syncCrontab(enabledTasks, binPath, runsDir);

  console.log(`Synced ${enabledTasks.length} task(s) to crontab:`);
  for (const task of enabledTasks) {
    console.log(`  ${task.id} — ${task.schedule}`);
  }
}
