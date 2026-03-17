import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { processLifecycle } from "../lib/lifecycle.js";
import { readRun, writeRun } from "../lib/report.js";

const TEST_DIR = join(process.cwd(), "__test_lifecycle_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs");

beforeEach(() => {
	mkdirSync(RUNS_DIR, { recursive: true });
});
afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("processLifecycle", () => {
	it("resolves pending run when external state matches", () => {
		const runDir = join(RUNS_DIR, "task-a", "01RESOLVE001");
		writeRun(runDir, {
			meta: {
				schema_version: 1,
				id: "01RESOLVE001",
				task: "task-a",
				status: "pending",

				url: "https://example.com/1",
				item_key: "https://example.com/1",
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			log: "done",
		});
		const result = processLifecycle(RUNS_DIR, "task-a", {
			auto_resolve: true,
			resolve_command: "echo MERGED",
			resolve_when: "MERGED|CLOSED",
		});
		expect(result.resolvedCount).toBe(1);
		expect(readRun(runDir).meta.status).toBe("completed");
	});

	it("does not resolve when command output does not match", () => {
		const runDir = join(RUNS_DIR, "task-a", "01RESOLVE002");
		writeRun(runDir, {
			meta: {
				schema_version: 1,
				id: "01RESOLVE002",
				task: "task-a",
				status: "pending",

				url: "https://example.com/1",
				item_key: "https://example.com/1",
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			log: "done",
		});
		const result = processLifecycle(RUNS_DIR, "task-a", {
			auto_resolve: true,
			resolve_command: "echo OPEN",
			resolve_when: "MERGED|CLOSED",
		});
		expect(result.resolvedCount).toBe(0);
		expect(readRun(runDir).meta.status).toBe("pending");
	});

	it("resolves error runs when external state matches", () => {
		const runDir = join(RUNS_DIR, "task-a", "01RESOLVE003");
		writeRun(runDir, {
			meta: {
				schema_version: 1,
				id: "01RESOLVE003",
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
		const result = processLifecycle(RUNS_DIR, "task-a", {
			auto_resolve: true,
			resolve_command: "echo CLOSED",
			resolve_when: "MERGED|CLOSED",
		});
		expect(result.resolvedCount).toBe(1);
		expect(readRun(runDir).meta.status).toBe("completed");
	});

	it("invalidates completed run when external state reverts", () => {
		const runDir = join(RUNS_DIR, "task-a", "01RESOLVE004");
		writeRun(runDir, {
			meta: {
				schema_version: 1,
				id: "01RESOLVE004",
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
		const result = processLifecycle(RUNS_DIR, "task-a", {
			auto_resolve: true,
			resolve_command: "echo OPEN",
			resolve_when: "MERGED|CLOSED",
		});
		expect(result.invalidatedKeys.has("https://example.com/1")).toBe(true);
		// Status remains completed — dedup uses invalidatedKeys to allow re-processing
		expect(readRun(runDir).meta.status).toBe("completed");
	});

	it("does not invalidate completed run when external state still matches", () => {
		const runDir = join(RUNS_DIR, "task-a", "01RESOLVE005");
		writeRun(runDir, {
			meta: {
				schema_version: 1,
				id: "01RESOLVE005",
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
		const result = processLifecycle(RUNS_DIR, "task-a", {
			auto_resolve: true,
			resolve_command: "echo MERGED",
			resolve_when: "MERGED|CLOSED",
		});
		expect(result.invalidatedKeys.size).toBe(0);
	});
});
