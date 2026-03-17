import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { filterNewItems } from "../lib/dedup.js";
import { writeRun } from "../lib/report.js";

const TEST_DIR = join(process.cwd(), "__test_dedup_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs");

beforeEach(() => {
	mkdirSync(RUNS_DIR, { recursive: true });
});
afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("filterNewItems", () => {
	it("returns all items when no runs exist", () => {
		const items = [{ url: "https://example.com/1" }];
		expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual(items);
	});

	it("filters out items with completed runs", () => {
		writeRun(join(RUNS_DIR, "task-a", "01RUN001"), {
			meta: {
				schema_version: 1,
				id: "01RUN001",
				task: "task-a",
				status: "completed",

				url: "https://example.com/1",
				item_key: "https://example.com/1",
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			log: "done",
		});
		const items = [
			{ url: "https://example.com/1" },
			{ url: "https://example.com/2" },
		];
		expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual([
			{ url: "https://example.com/2" },
		]);
	});

	it("filters out items with pending runs", () => {
		writeRun(join(RUNS_DIR, "task-a", "01RUN005"), {
			meta: {
				schema_version: 1,
				id: "01RUN005",
				task: "task-a",
				status: "pending",

				url: "https://example.com/1",
				item_key: "https://example.com/1",
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			log: "pending",
		});
		const items = [{ url: "https://example.com/1" }];
		expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual([]);
	});

	it("includes items whose previous run was an error (retry)", () => {
		writeRun(join(RUNS_DIR, "task-a", "01RUN002"), {
			meta: {
				schema_version: 1,
				id: "01RUN002",
				task: "task-a",
				status: "error",

				url: "https://example.com/1",
				item_key: "https://example.com/1",
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 1,
			},
			log: "failed",
		});
		const items = [{ url: "https://example.com/1" }];
		expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual(items);
	});

	it("does not filter items from different tasks", () => {
		writeRun(join(RUNS_DIR, "task-b", "01RUN003"), {
			meta: {
				schema_version: 1,
				id: "01RUN003",
				task: "task-b",
				status: "completed",

				url: "https://example.com/1",
				item_key: "https://example.com/1",
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			log: "done",
		});
		const items = [{ url: "https://example.com/1" }];
		expect(filterNewItems(RUNS_DIR, "task-a", items, "url")).toEqual(items);
	});

	it("allows completed items through when invalidated by lifecycle", () => {
		writeRun(join(RUNS_DIR, "task-a", "01RUN004"), {
			meta: {
				schema_version: 1,
				id: "01RUN004",
				task: "task-a",
				status: "completed",

				url: "https://example.com/1",
				item_key: "https://example.com/1",
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			log: "done",
		});
		const items = [{ url: "https://example.com/1" }];
		const invalidatedKeys = new Set(["https://example.com/1"]);
		expect(
			filterNewItems(RUNS_DIR, "task-a", items, "url", invalidatedKeys),
		).toEqual(items);
	});
});
