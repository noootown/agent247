import { describe, expect, it } from "vitest";
import type { TaskConfig } from "../../../../lib/config.js";
import type { RunMeta, RunRecord } from "../../../../lib/report.js";
import type { TaskGroup, VisibleLine } from "../../state.js";
import { stripAnsi } from "../ansi.js";
import { renderListRow } from "../list.js";

function makeConfig(overrides: Partial<TaskConfig> = {}): TaskConfig {
	return {
		id: "test-task",
		name: "test-task",
		schedule: "every 1h",
		timeout: 300,
		enabled: true,
		model: "claude-sonnet",
		prompt_mode: "batch",
		prompt: "",
		...overrides,
	};
}

function makeGroup(overrides: Partial<TaskGroup> = {}): TaskGroup {
	return {
		task: "my-task",
		config: makeConfig(),
		runs: [],
		expanded: true,
		running: false,
		enabled: true,
		schedule: "every 1h",
		lastCheck: null,
		...overrides,
	};
}

function makeMeta(overrides: Partial<RunMeta> = {}): RunMeta {
	return {
		schema_version: 1,
		id: "run-001",
		task: "my-task",
		status: "completed",
		url: "https://github.com/owner/repo/pull/42",
		item_key: null,
		started_at: new Date().toISOString(),
		finished_at: new Date().toISOString(),
		duration_seconds: 10,
		exit_code: 0,
		...overrides,
	};
}

function makeRun(overrides: Partial<RunMeta> = {}): RunRecord {
	return {
		meta: makeMeta(overrides),
		dir: "/tmp/runs/run-001",
	};
}

describe("renderListRow", () => {
	const WIDTH = 80;

	it("renders expanded group with down arrow", () => {
		const line: VisibleLine = {
			type: "group",
			group: makeGroup({ expanded: true }),
			index: 0,
		};
		const result = renderListRow(line, WIDTH, false);
		const plain = stripAnsi(result);
		expect(plain).toContain("▼");
		expect(plain).toContain("my-task");
	});

	it("renders collapsed group with right arrow", () => {
		const line: VisibleLine = {
			type: "group",
			group: makeGroup({ expanded: false }),
			index: 0,
		};
		const result = renderListRow(line, WIDTH, false);
		const plain = stripAnsi(result);
		expect(plain).toContain("▶");
		expect(plain).toContain("my-task");
	});

	it("shows (disabled) for disabled groups", () => {
		const line: VisibleLine = {
			type: "group",
			group: makeGroup({ enabled: false }),
			index: 0,
		};
		const result = renderListRow(line, WIDTH, false);
		const plain = stripAnsi(result);
		expect(plain).toContain("(disabled)");
	});

	it("renders a run line with status and URL slug", () => {
		const line: VisibleLine = {
			type: "run",
			run: makeRun({
				status: "completed",
				url: "https://github.com/owner/repo/pull/42",
			}),
			group: makeGroup(),
			index: 1,
		};
		const result = renderListRow(line, 200, false);
		const plain = stripAnsi(result);
		expect(plain).toContain("completed");
		expect(plain).toContain("PR #42");
	});

	it("renders selected group with padding", () => {
		const line: VisibleLine = {
			type: "group",
			group: makeGroup({ expanded: true }),
			index: 0,
		};
		const result = renderListRow(line, WIDTH, true);
		const plain = stripAnsi(result);
		expect(plain).toContain("▼");
		expect(plain).toContain("my-task");
		expect(plain.length).toBe(WIDTH);
	});

	it("renders selected run line", () => {
		const line: VisibleLine = {
			type: "run",
			run: makeRun({
				status: "error",
				url: "https://github.com/owner/repo/pull/99",
			}),
			group: makeGroup(),
			index: 1,
		};
		const WIDE = 120;
		const result = renderListRow(line, WIDE, true);
		const plain = stripAnsi(result);
		expect(plain).toContain("x");
		expect(plain).toContain("error");
		expect(plain).toContain("PR #99");
		expect(plain.length).toBe(WIDE);
	});
});
