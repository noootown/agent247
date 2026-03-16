import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface RunMeta {
  schema_version: number;
  id: string;
  task: string;
  status: "skipped" | "no-action" | "completed" | "error" | "resolved";
  reviewed: boolean;
  url: string | null;
  item_key: string | null;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  exit_code: number;
}

export interface RunData {
  meta: RunMeta;
  prompt?: string;
  rawJson?: string;
  report?: string;
  log: string;
}

export interface RunRecord {
  meta: RunMeta;
  report?: string;
  dir: string;
}

export function writeRun(runDir: string, data: RunData): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "meta.yaml"), yaml.dump(data.meta));
  writeFileSync(join(runDir, "log.txt"), data.log);
  if (data.prompt !== undefined) {
    writeFileSync(join(runDir, "prompt.rendered.md"), data.prompt);
  }
  if (data.rawJson !== undefined) {
    writeFileSync(join(runDir, "raw.json"), data.rawJson);
  }
  if (data.report !== undefined) {
    writeFileSync(join(runDir, "report.md"), data.report);
  }
}

export function updateRunMeta(runDir: string, updates: Partial<RunMeta>): void {
  const metaPath = join(runDir, "meta.yaml");
  const existing = yaml.load(readFileSync(metaPath, "utf-8")) as RunMeta;
  writeFileSync(metaPath, yaml.dump({ ...existing, ...updates }));
}

export function readRun(runDir: string): RunRecord {
  const metaPath = join(runDir, "meta.yaml");
  const meta = yaml.load(readFileSync(metaPath, "utf-8")) as RunMeta;
  const reportPath = join(runDir, "report.md");
  const report = existsSync(reportPath) ? readFileSync(reportPath, "utf-8") : undefined;
  return { meta, report, dir: runDir };
}

export interface RunFilter {
  task?: string;
  status?: RunMeta["status"];
  reviewed?: boolean;
}

export function listRuns(runsDir: string, filter?: RunFilter): RunRecord[] {
  if (!existsSync(runsDir)) return [];
  const entries = readdirSync(runsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(runsDir, d.name, "meta.yaml")));
  let runs = entries.map((d) => readRun(join(runsDir, d.name)));
  if (filter?.task) runs = runs.filter((r) => r.meta.task === filter.task);
  if (filter?.status) runs = runs.filter((r) => r.meta.status === filter.status);
  if (filter?.reviewed !== undefined) runs = runs.filter((r) => r.meta.reviewed === filter.reviewed);
  runs.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
  return runs;
}
