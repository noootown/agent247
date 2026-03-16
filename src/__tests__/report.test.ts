import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeRun, readRun, listRuns } from "../lib/report.js";

const TEST_DIR = join(process.cwd(), "__test_report_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs");

beforeEach(() => { mkdirSync(RUNS_DIR, { recursive: true }); });
afterEach(() => { rmSync(TEST_DIR, { recursive: true, force: true }); });

describe("writeRun", () => {
  it("writes all artifacts for a completed run", () => {
    const runDir = join(RUNS_DIR, "01TEST001");
    writeRun(runDir, {
      meta: { schema_version: 1, id: "01TEST001", task: "test-task", status: "completed", reviewed: false, url: "https://example.com/pr/1", item_key: "https://example.com/pr/1", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
      prompt: "rendered prompt", rawJson: '{"result": "test"}', report: "# Report\nAll good", log: "[INFO] done",
    });
    expect(existsSync(join(runDir, "meta.yaml"))).toBe(true);
    expect(existsSync(join(runDir, "prompt.rendered.md"))).toBe(true);
    expect(existsSync(join(runDir, "raw.json"))).toBe(true);
    expect(existsSync(join(runDir, "report.md"))).toBe(true);
    expect(existsSync(join(runDir, "log.txt"))).toBe(true);
  });

  it("writes only meta and log for skipped runs", () => {
    const runDir = join(RUNS_DIR, "01TEST002");
    writeRun(runDir, {
      meta: { schema_version: 1, id: "01TEST002", task: "test-task", status: "skipped", reviewed: false, url: null, item_key: null, started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:00:01Z", duration_seconds: 1, exit_code: 0 },
      log: "[INFO] no items",
    });
    expect(existsSync(join(runDir, "meta.yaml"))).toBe(true);
    expect(existsSync(join(runDir, "log.txt"))).toBe(true);
    expect(existsSync(join(runDir, "report.md"))).toBe(false);
  });
});

describe("readRun", () => {
  it("reads meta from a run directory", () => {
    const runDir = join(RUNS_DIR, "01TEST003");
    writeRun(runDir, {
      meta: { schema_version: 1, id: "01TEST003", task: "test-task", status: "completed", reviewed: false, url: "https://example.com", item_key: "https://example.com", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
      report: "test report", log: "log",
    });
    const run = readRun(runDir);
    expect(run.meta.task).toBe("test-task");
    expect(run.meta.status).toBe("completed");
  });
});

describe("listRuns", () => {
  it("lists runs filtered by task", () => {
    for (const [id, task] of [["01TESTA001", "task-a"], ["01TESTB001", "task-b"]] as const) {
      writeRun(join(RUNS_DIR, id), {
        meta: { schema_version: 1, id, task, status: "completed", reviewed: false, url: null, item_key: null, started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
        log: "log",
      });
    }
    expect(listRuns(RUNS_DIR)).toHaveLength(2);
    const filtered = listRuns(RUNS_DIR, { task: "task-a" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].meta.task).toBe("task-a");
  });

  it("filters by status", () => {
    writeRun(join(RUNS_DIR, "01SKIP1"), {
      meta: { schema_version: 1, id: "01SKIP1", task: "t", status: "skipped", reviewed: false, url: null, item_key: null, started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:00:01Z", duration_seconds: 1, exit_code: 0 },
      log: "log",
    });
    writeRun(join(RUNS_DIR, "01COMP1"), {
      meta: { schema_version: 1, id: "01COMP1", task: "t", status: "completed", reviewed: false, url: null, item_key: null, started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
      log: "log",
    });
    const completed = listRuns(RUNS_DIR, { status: "completed" });
    expect(completed).toHaveLength(1);
    expect(completed[0].meta.status).toBe("completed");
  });
});
