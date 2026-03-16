import { join } from "node:path";
import { existsSync } from "node:fs";
import { readRun } from "../lib/report.js";

export function showCommand(ulid: string, baseDir: string): void {
  const runDir = join(baseDir, "runs", ulid);
  if (!existsSync(runDir)) {
    console.error(`Run not found: ${ulid}`);
    process.exit(1);
  }
  const run = readRun(runDir);
  console.log(`\n  Run: ${run.meta.id}`);
  console.log(`  Task: ${run.meta.task}`);
  console.log(`  Status: ${run.meta.status}`);
  console.log(`  Time: ${run.meta.started_at}`);
  console.log(`  Duration: ${run.meta.duration_seconds}s`);
  if (run.meta.url) console.log(`  URL: ${run.meta.url}`);
  console.log(`  Reviewed: ${run.meta.reviewed}`);
  console.log();
  if (run.report) {
    console.log("  ── Report ──────────────────────────────────\n");
    console.log(run.report);
    console.log();
  } else {
    console.log("  No report (skipped run)\n");
  }
}
