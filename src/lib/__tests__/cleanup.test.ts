import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanupRuns, parseRetain } from "../cleanup.js";
import type { RunRecord } from "../report.js";

const TEST_DIR = join(process.cwd(), "__test_cleanup_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs", "test-task");
const BIN_DIR = join(TEST_DIR, ".bin");

function makeRun(
	id: string,
	status: string,
	itemKey: string,
	itemVars?: Record<string, string>,
): RunRecord {
	const runDir = join(RUNS_DIR, id);
	mkdirSync(runDir, { recursive: true });
	const meta = {
		schema_version: 1,
		id,
		task: "test-task",
		status: status as RunRecord["meta"]["status"],
		url: null,
		item_key: itemKey || null,
		started_at: "2026-01-01T00:00:00Z",
		finished_at: "2026-01-01T00:00:01Z",
		duration_seconds: 1,
		exit_code: 0,
	};
	const dataJson: Record<string, unknown> = { run: meta };
	if (itemVars) dataJson.vars = itemVars;
	writeFileSync(join(runDir, "data.json"), JSON.stringify(dataJson));
	return { meta, dir: runDir };
}

beforeEach(() => {
	mkdirSync(RUNS_DIR, { recursive: true });
	mkdirSync(BIN_DIR, { recursive: true });
});

afterEach(() => {
	rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("parseRetain", () => {
	it("parses hours", () => expect(parseRetain("12h")).toBe(43200000));
	it("parses days", () => expect(parseRetain("7d")).toBe(604800000));
	it("parses minutes", () => expect(parseRetain("30m")).toBe(1800000));
	it("returns 0 for invalid", () => expect(parseRetain("abc")).toBe(0));
	it("returns 0 for undefined", () => expect(parseRetain()).toBe(0));
});

describe("cleanupRuns with check field", () => {
	it("moves run to .bin when check output matches", () => {
		const run = makeRun("run1", "completed", "item1");
		const cleaned = cleanupRuns(
			[run],
			{ check: "echo MERGED", when: "MERGED" },
			{},
			{},
			BIN_DIR,
			"test-task",
		);
		expect(cleaned).toBe(1);
		expect(existsSync(run.dir)).toBe(false);
		expect(existsSync(join(BIN_DIR, "test-task", "run1"))).toBe(true);
	});

	it("does not move run when check output does not match", () => {
		const run = makeRun("run2", "completed", "item2");
		const cleaned = cleanupRuns(
			[run],
			{ check: "echo OPEN", when: "MERGED" },
			{},
			{},
			BIN_DIR,
			"test-task",
		);
		expect(cleaned).toBe(0);
		expect(existsSync(run.dir)).toBe(true);
	});

	it("skips processing runs", () => {
		const run = makeRun("run3", "processing", "item3");
		const cleaned = cleanupRuns(
			[run],
			{ check: "echo MERGED", when: "MERGED" },
			{},
			{},
			BIN_DIR,
			"test-task",
		);
		expect(cleaned).toBe(0);
	});

	it("renders template variables in check command", () => {
		const run = makeRun("run4", "completed", "item4", { branch: "main" });
		const cleaned = cleanupRuns(
			[run],
			{ check: "echo {{branch}}", when: "main" },
			{},
			{},
			BIN_DIR,
			"test-task",
		);
		expect(cleaned).toBe(1);
	});

	it("passes taskVars to check command rendering", () => {
		const run = makeRun("run5", "completed", "item5");
		const cleaned = cleanupRuns(
			[run],
			{ check: "echo {{my_task_var}}", when: "hello" },
			{},
			{ my_task_var: "hello" },
			BIN_DIR,
			"test-task",
		);
		expect(cleaned).toBe(1);
	});
});

describe("cleanupRuns with teardown", () => {
	it("executes teardown command after moving to .bin", () => {
		const markerFile = join(TEST_DIR, "teardown-ran");
		const run = makeRun("run6", "completed", "item6");
		cleanupRuns(
			[run],
			{ check: "echo YES", when: "YES", teardown: `touch ${markerFile}` },
			{},
			{},
			BIN_DIR,
			"test-task",
		);
		expect(existsSync(markerFile)).toBe(true);
		expect(existsSync(join(BIN_DIR, "test-task", "run6"))).toBe(true);
	});

	it("renders template variables in teardown command", () => {
		const markerFile = join(TEST_DIR, "teardown-var");
		const run = makeRun("run7", "completed", "item7", { marker: markerFile });
		cleanupRuns(
			[run],
			{ check: "echo YES", when: "YES", teardown: "touch {{marker}}" },
			{},
			{},
			BIN_DIR,
			"test-task",
		);
		expect(existsSync(markerFile)).toBe(true);
	});

	it("still moves to .bin even if teardown fails", () => {
		const run = makeRun("run8", "completed", "item8");
		const cleaned = cleanupRuns(
			[run],
			{ check: "echo YES", when: "YES", teardown: "exit 1" },
			{},
			{},
			BIN_DIR,
			"test-task",
		);
		expect(cleaned).toBe(1);
		expect(existsSync(join(BIN_DIR, "test-task", "run8"))).toBe(true);
	});

	it("does not run teardown when check does not match", () => {
		const markerFile = join(TEST_DIR, "teardown-no-run");
		const run = makeRun("run9", "completed", "item9");
		cleanupRuns(
			[run],
			{ check: "echo OPEN", when: "MERGED", teardown: `touch ${markerFile}` },
			{},
			{},
			BIN_DIR,
			"test-task",
		);
		expect(existsSync(markerFile)).toBe(false);
	});
});

describe("cleanupRuns skips teardown for shared item_key", () => {
	it("skips teardown when another run in runsDir shares the same item_key and has teardown", () => {
		const markerFile = join(TEST_DIR, "teardown-shared");
		const run1 = makeRun("run-a", "completed", "shared-key");
		const _run2 = makeRun("run-b", "completed", "shared-key");

		// Create a task config with teardown so loadTaskConfig can find it
		const taskDir = join(TEST_DIR, "tasks", "test-task");
		mkdirSync(taskDir, { recursive: true });
		writeFileSync(
			join(taskDir, "config.yaml"),
			'name: Test\nschedule: "* * * * *"\ntimeout: 60\nenabled: true\ncleanup:\n  teardown: "echo cleanup"\n',
		);
		writeFileSync(join(taskDir, "prompt.md"), "prompt");

		cleanupRuns(
			[run1],
			{ check: "echo YES", when: "YES", teardown: `touch ${markerFile}` },
			{},
			{},
			BIN_DIR,
			"test-task",
			TEST_DIR,
			join(TEST_DIR, "runs"),
		);

		expect(existsSync(join(BIN_DIR, "test-task", "run-a"))).toBe(true);
		expect(existsSync(markerFile)).toBe(false);
	});

	it("runs teardown when it is the last run with that item_key", () => {
		const markerFile = join(TEST_DIR, "teardown-last");
		const run1 = makeRun("run-c", "completed", "unique-key");

		cleanupRuns(
			[run1],
			{ check: "echo YES", when: "YES", teardown: `touch ${markerFile}` },
			{},
			{},
			BIN_DIR,
			"test-task",
			undefined,
			join(TEST_DIR, "runs"),
		);

		expect(existsSync(join(BIN_DIR, "test-task", "run-c"))).toBe(true);
		expect(existsSync(markerFile)).toBe(true);
	});

	it("serial cleanup of multiple runs with same item_key runs teardown only for last", () => {
		const markerFile = join(TEST_DIR, "teardown-serial");
		const run1 = makeRun("run-d", "completed", "serial-key");
		const run2 = makeRun("run-e", "completed", "serial-key");

		cleanupRuns(
			[run1, run2],
			{ check: "echo YES", when: "YES", teardown: `touch ${markerFile}` },
			{},
			{},
			BIN_DIR,
			"test-task",
			undefined,
			join(TEST_DIR, "runs"),
		);

		expect(existsSync(join(BIN_DIR, "test-task", "run-d"))).toBe(true);
		expect(existsSync(join(BIN_DIR, "test-task", "run-e"))).toBe(true);
		expect(existsSync(markerFile)).toBe(true);
	});

	it("runs teardown normally when item_key is null", () => {
		const markerFile = join(TEST_DIR, "teardown-null-key");
		const run1 = makeRun("run-f", "completed", "");

		cleanupRuns(
			[run1],
			{ check: "echo YES", when: "YES", teardown: `touch ${markerFile}` },
			{},
			{},
			BIN_DIR,
			"test-task",
			undefined,
			join(TEST_DIR, "runs"),
		);

		expect(existsSync(markerFile)).toBe(true);
	});
});
