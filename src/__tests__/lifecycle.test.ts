import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveRuns } from "../lib/lifecycle.js";
import { writeRun, readRun } from "../lib/report.js";

const TEST_DIR = join(process.cwd(), "__test_lifecycle_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs");

beforeEach(() => { mkdirSync(RUNS_DIR, { recursive: true }); });
afterEach(() => { rmSync(TEST_DIR, { recursive: true, force: true }); });

describe("resolveRuns", () => {
  it("marks completed run as resolved when resolve command matches", () => {
    const runDir = join(RUNS_DIR, "01RESOLVE001");
    writeRun(runDir, {
      meta: { schema_version: 1, id: "01RESOLVE001", task: "task-a", status: "completed", reviewed: false, url: "https://example.com/1", item_key: "https://example.com/1", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
      log: "done",
    });
    const resolved = resolveRuns(RUNS_DIR, "task-a", { auto_resolve: true, resolve_command: "echo MERGED", resolve_when: "MERGED|CLOSED" });
    expect(resolved).toBe(1);
    expect(readRun(runDir).meta.status).toBe("resolved");
  });

  it("does not resolve when command output does not match", () => {
    const runDir = join(RUNS_DIR, "01RESOLVE002");
    writeRun(runDir, {
      meta: { schema_version: 1, id: "01RESOLVE002", task: "task-a", status: "completed", reviewed: false, url: "https://example.com/1", item_key: "https://example.com/1", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
      log: "done",
    });
    const resolved = resolveRuns(RUNS_DIR, "task-a", { auto_resolve: true, resolve_command: "echo OPEN", resolve_when: "MERGED|CLOSED" });
    expect(resolved).toBe(0);
    expect(readRun(runDir).meta.status).toBe("completed");
  });

  it("also resolves error runs", () => {
    const runDir = join(RUNS_DIR, "01RESOLVE003");
    writeRun(runDir, {
      meta: { schema_version: 1, id: "01RESOLVE003", task: "task-a", status: "error", reviewed: false, url: "https://example.com/1", item_key: "https://example.com/1", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 1 },
      log: "failed",
    });
    const resolved = resolveRuns(RUNS_DIR, "task-a", { auto_resolve: true, resolve_command: "echo CLOSED", resolve_when: "MERGED|CLOSED" });
    expect(resolved).toBe(1);
    expect(readRun(runDir).meta.status).toBe("resolved");
  });

  it("skips already resolved runs", () => {
    writeRun(join(RUNS_DIR, "01RESOLVE004"), {
      meta: { schema_version: 1, id: "01RESOLVE004", task: "task-a", status: "resolved", reviewed: false, url: "https://example.com/1", item_key: "https://example.com/1", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
      log: "done",
    });
    const resolved = resolveRuns(RUNS_DIR, "task-a", { auto_resolve: true, resolve_command: "echo MERGED", resolve_when: "MERGED|CLOSED" });
    expect(resolved).toBe(0);
  });
});
