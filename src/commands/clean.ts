import { join } from "node:path";
import { rmSync } from "node:fs";
import { listRuns, type RunMeta } from "../lib/report.js";

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(d|h|m)$/);
  if (!match) throw new Error(`Invalid duration: ${duration}. Use format: 7d, 24h, 30m`);
  const value = parseInt(match[1], 10);
  const unit = match[2];
  switch (unit) {
    case "d": return value * 86400 * 1000;
    case "h": return value * 3600 * 1000;
    case "m": return value * 60 * 1000;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

export function cleanCommand(
  baseDir: string,
  options: { olderThan: string; status?: RunMeta["status"]; includeUnreviewed?: boolean }
): void {
  const runsDir = join(baseDir, "runs");
  const maxAge = parseDuration(options.olderThan);
  const cutoff = Date.now() - maxAge;
  let runs = listRuns(runsDir);
  runs = runs.filter((r) => Date.parse(r.meta.started_at) < cutoff);
  if (options.status) {
    runs = runs.filter((r) => r.meta.status === options.status);
  }
  if (!options.includeUnreviewed) {
    runs = runs.filter((r) => r.meta.reviewed);
  }
  if (runs.length === 0) {
    console.log("No runs matching criteria to clean.");
    return;
  }
  for (const run of runs) {
    rmSync(run.dir, { recursive: true, force: true });
  }
  console.log(`Cleaned ${runs.length} run(s).`);
}
