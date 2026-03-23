import { existsSync, mkdirSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { listRuns, readRun, writeRun } from "../report.js";

const TEST_DIR = join(process.cwd(), "__test_report_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs");

beforeEach(() => {
	mkdirSync(RUNS_DIR, { recursive: true });
});
afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("writeRun", () => {
	it("writes data.json with all sections for a completed run", () => {
		const runDir = join(RUNS_DIR, "test-task", "01TEST001");
		writeRun(runDir, {
			meta: {
				schema_version: 1,
				id: "01TEST001",
				task: "test-task",
				status: "completed",
				url: "https://example.com/pr/1",
				item_key: "https://example.com/pr/1",
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			config: { name: "test" },
			vars: { key: "val" },
			discovery: [{ id: "item1" }],
			result: { output: "test" },
			prompt: "rendered prompt",
			report: "# Report\nAll good",
			log: "[INFO] done",
		});
		expect(existsSync(join(runDir, "data.json"))).toBe(true);
		expect(existsSync(join(runDir, "prompt.rendered.md"))).toBe(true);
		expect(existsSync(join(runDir, "report.md"))).toBe(true);
		expect(existsSync(join(runDir, "log.txt"))).toBe(true);

		const data = JSON.parse(readFileSync(join(runDir, "data.json"), "utf-8"));
		expect(data.run.id).toBe("01TEST001");
		expect(data.config.name).toBe("test");
		expect(data.vars.key).toBe("val");
		expect(data.discovery).toHaveLength(1);
		expect(data.result.output).toBe("test");
	});

	it("writes only data.json and log for skipped runs", () => {
		const runDir = join(RUNS_DIR, "test-task", "01TEST002");
		writeRun(runDir, {
			meta: {
				schema_version: 1,
				id: "01TEST002",
				task: "test-task",
				status: "skipped",
				url: null,
				item_key: null,
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:00:01Z",
				duration_seconds: 1,
				exit_code: 0,
			},
			log: "[INFO] no items",
		});
		expect(existsSync(join(runDir, "data.json"))).toBe(true);
		expect(existsSync(join(runDir, "log.txt"))).toBe(true);
		expect(existsSync(join(runDir, "report.md"))).toBe(false);
	});

	it("redacts secrets when provided", () => {
		const runDir = join(RUNS_DIR, "test-task", "01TEST003");
		const secrets = new Map([["sk-secret-123", "API_KEY"]]);
		writeRun(runDir, {
			meta: {
				schema_version: 1,
				id: "01TEST003",
				task: "test-task",
				status: "completed",
				url: null,
				item_key: null,
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			vars: { token: "sk-secret-123" },
			prompt: "use sk-secret-123",
			log: "key=sk-secret-123",
			secrets,
		});
		const data = JSON.parse(readFileSync(join(runDir, "data.json"), "utf-8"));
		expect(data.vars.token).toBe("[REDACTED:API_KEY]");
		const prompt = readFileSync(join(runDir, "prompt.rendered.md"), "utf-8");
		expect(prompt).toBe("use [REDACTED:API_KEY]");
		const log = readFileSync(join(runDir, "log.txt"), "utf-8");
		expect(log).toBe("key=[REDACTED:API_KEY]");
	});
});

describe("readRun", () => {
	it("reads meta from data.json", () => {
		const runDir = join(RUNS_DIR, "test-task", "01TEST004");
		writeRun(runDir, {
			meta: {
				schema_version: 1,
				id: "01TEST004",
				task: "test-task",
				status: "completed",
				url: "https://example.com",
				item_key: "https://example.com",
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			report: "test report",
			log: "log",
		});
		const run = readRun(runDir);
		expect(run.meta.task).toBe("test-task");
		expect(run.meta.status).toBe("completed");
	});
});

describe("listRuns", () => {
	it("lists runs filtered by task", () => {
		for (const [id, task] of [
			["01TESTA001", "task-a"],
			["01TESTB001", "task-b"],
		] as const) {
			writeRun(join(RUNS_DIR, task, id), {
				meta: {
					schema_version: 1,
					id,
					task,
					status: "completed",
					url: null,
					item_key: null,
					started_at: "2026-03-15T10:00:00Z",
					finished_at: "2026-03-15T10:01:00Z",
					duration_seconds: 60,
					exit_code: 0,
				},
				log: "log",
			});
		}
		expect(listRuns(RUNS_DIR)).toHaveLength(2);
		const filtered = listRuns(RUNS_DIR, { task: "task-a" });
		expect(filtered).toHaveLength(1);
		expect(filtered[0].meta.task).toBe("task-a");
	});

	it("filters by status", () => {
		writeRun(join(RUNS_DIR, "t", "01SKIP1"), {
			meta: {
				schema_version: 1,
				id: "01SKIP1",
				task: "t",
				status: "skipped",
				url: null,
				item_key: null,
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:00:01Z",
				duration_seconds: 1,
				exit_code: 0,
			},
			log: "log",
		});
		writeRun(join(RUNS_DIR, "t", "01COMP1"), {
			meta: {
				schema_version: 1,
				id: "01COMP1",
				task: "t",
				status: "completed",
				url: null,
				item_key: null,
				started_at: "2026-03-15T10:00:00Z",
				finished_at: "2026-03-15T10:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			log: "log",
		});
		const completed = listRuns(RUNS_DIR, { status: "completed" });
		expect(completed).toHaveLength(1);
		expect(completed[0].meta.status).toBe("completed");
	});
});
