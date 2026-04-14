import { describe, expect, it, vi } from "vitest";

vi.mock("../config.js", () => ({
	listTasks: vi.fn(),
}));
vi.mock("../report.js", () => ({
	listRuns: vi.fn(),
}));

import { listTasks as listTaskConfigs } from "../config.js";
import { checkRun, listMcpTasks, runTask } from "../mcp-tools.js";
import { listRuns } from "../report.js";

describe("listMcpTasks", () => {
	it("returns task summaries from workspace", () => {
		vi.mocked(listTaskConfigs).mockReturnValue([
			{
				id: "daily-report",
				config: {
					id: "daily-report",
					name: "Daily Report",
					description: "Generates a daily summary",
					schedule: "0 9 * * *",
					timeout: 120,
					cron_enabled: true,
					prompt: "Generate report",
					model: "sonnet",
				},
			},
			{
				id: "weekly-sync",
				config: {
					id: "weekly-sync",
					name: "Weekly Sync",
					description: undefined,
					schedule: "0 0 * * 1",
					timeout: 300,
					cron_enabled: false,
					prompt: "Sync data",
					model: "sonnet",
				},
			},
		]);

		const result = listMcpTasks("/tmp/workspace");
		expect(result).toEqual([
			{
				task_id: "daily-report",
				name: "Daily Report",
				description: "Generates a daily summary",
				cron_enabled: true,
				schedule: "0 9 * * *",
			},
			{
				task_id: "weekly-sync",
				name: "Weekly Sync",
				description: undefined,
				cron_enabled: false,
				schedule: "0 0 * * 1",
			},
		]);
	});
});

describe("checkRun", () => {
	it("returns completed run with report", () => {
		vi.mocked(listRuns).mockReturnValue([
			{
				meta: {
					schema_version: 1,
					id: "RUN_001",
					task: "daily-report",
					status: "completed",
					url: "https://example.com/report",
					item_key: "key-1",
					started_at: "2026-01-01T00:00:00Z",
					finished_at: "2026-01-01T00:01:00Z",
					duration_seconds: 60,
					exit_code: 0,
				},
				report: "Everything went well.",
				dir: "/tmp/runs/daily-report/run-001",
			},
		]);

		const result = checkRun("/tmp/workspace", "RUN_001");
		expect(result).toMatchObject({
			run_id: "RUN_001",
			task_id: "daily-report",
			status: "completed",
			url: "https://example.com/report",
			item_key: "key-1",
			report: "Everything went well.",
			duration_seconds: 60,
			started_at: "2026-01-01T00:00:00Z",
			finished_at: "2026-01-01T00:01:00Z",
			exit_code: 0,
			run_dir: "/tmp/runs/daily-report/run-001",
		});
	});

	it("returns processing status for in-progress run", () => {
		vi.mocked(listRuns).mockReturnValue([
			{
				meta: {
					schema_version: 1,
					id: "RUN_002",
					task: "weekly-sync",
					status: "processing",
					url: null,
					item_key: null,
					started_at: "2026-01-01T00:00:00Z",
					finished_at: "2026-01-01T00:00:00Z",
					duration_seconds: 0,
					exit_code: -1,
				},
				dir: "/tmp/runs/weekly-sync/run-002",
			},
		]);

		const result = checkRun("/tmp/workspace", "RUN_002");
		expect(result).toMatchObject({
			run_id: "RUN_002",
			task_id: "weekly-sync",
			status: "processing",
			run_dir: "/tmp/runs/weekly-sync/run-002",
		});
	});

	it("returns null for unknown run_id", () => {
		vi.mocked(listRuns).mockReturnValue([]);
		const result = checkRun("/tmp/workspace", "NONEXISTENT");
		expect(result).toBeNull();
	});
});

describe("runTask", () => {
	it("throws for unknown task_id", () => {
		vi.mocked(listTaskConfigs).mockReturnValue([]);
		expect(() => runTask("/tmp/workspace", "nonexistent-task")).toThrow(
			"Task not found: nonexistent-task",
		);
	});
});
