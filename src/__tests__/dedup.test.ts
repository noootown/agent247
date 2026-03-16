import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { filterNewItems } from "../lib/dedup.js";
import { writeRun } from "../lib/report.js";

const TEST_DIR = join(process.cwd(), "__test_dedup_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs");

beforeEach(() => { mkdirSync(RUNS_DIR, { recursive: true }); });
afterEach(() => { rmSync(TEST_DIR, { recursive: true, force: true }); });

describe("filterNewItems", () => {
  it("returns all items when no runs exist", () => {
    const items = [{ url: "https://example.com/1" }];
    expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual(items);
  });

  it("filters out items with completed runs", () => {
    writeRun(join(RUNS_DIR, "01RUN001"), {
      meta: { schema_version: 1, id: "01RUN001", task: "task-a", status: "completed", reviewed: false, url: "https://example.com/1", item_key: "https://example.com/1", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
      log: "done",
    });
    const items = [{ url: "https://example.com/1" }, { url: "https://example.com/2" }];
    expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual([{ url: "https://example.com/2" }]);
  });

  it("includes items whose previous run was an error (retry)", () => {
    writeRun(join(RUNS_DIR, "01RUN002"), {
      meta: { schema_version: 1, id: "01RUN002", task: "task-a", status: "error", reviewed: false, url: "https://example.com/1", item_key: "https://example.com/1", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 1 },
      log: "failed",
    });
    const items = [{ url: "https://example.com/1" }];
    expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual(items);
  });

  it("does not filter items from different tasks", () => {
    writeRun(join(RUNS_DIR, "01RUN003"), {
      meta: { schema_version: 1, id: "01RUN003", task: "task-b", status: "completed", reviewed: false, url: "https://example.com/1", item_key: "https://example.com/1", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
      log: "done",
    });
    const items = [{ url: "https://example.com/1" }];
    expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual(items);
  });

  it("ignores resolved runs (item can be re-processed)", () => {
    writeRun(join(RUNS_DIR, "01RUN004"), {
      meta: { schema_version: 1, id: "01RUN004", task: "task-a", status: "resolved", reviewed: false, url: "https://example.com/1", item_key: "https://example.com/1", started_at: "2026-03-15T10:00:00Z", finished_at: "2026-03-15T10:01:00Z", duration_seconds: 60, exit_code: 0 },
      log: "done",
    });
    const items = [{ url: "https://example.com/1" }];
    expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual(items);
  });
});
