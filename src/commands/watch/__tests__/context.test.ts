import { existsSync, readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	return {
		...actual,
		existsSync: vi.fn(() => false),
		readFileSync: vi.fn(() => ""),
		writeFileSync: vi.fn(),
		unlinkSync: vi.fn(),
	};
});

vi.mock("node:child_process", async () => {
	const actual =
		await vi.importActual<typeof import("node:child_process")>(
			"node:child_process",
		);
	return {
		...actual,
		execSync: vi.fn(),
		spawn: vi.fn(() => ({ on: vi.fn() })),
	};
});

vi.mock("../../../lib/cleanup.js", () => ({
	archiveRun: vi.fn(),
}));

vi.mock("../../../lib/config.js", () => ({
	loadTaskConfig: vi.fn(() => {
		throw new Error("no config");
	}),
}));

vi.mock("../../../lib/report.js", () => ({
	listRuns: vi.fn(() => []),
	updateRunMeta: vi.fn(),
}));

vi.mock("../../../lib/template.js", () => ({
	render: vi.fn(() => "echo ok"),
}));

vi.mock("../../sync.js", () => ({
	syncCommand: vi.fn(),
}));

import { archiveRun } from "../../../lib/cleanup.js";
import { loadTaskConfig } from "../../../lib/config.js";
import { listRuns, updateRunMeta } from "../../../lib/report.js";
import { syncCommand } from "../../sync.js";
import {
	makeSoftDelete,
	makeSpawnRun,
	makeStopTask,
	makeToggleTask,
} from "../context.js";

describe("makeSoftDelete", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(existsSync).mockReturnValue(false);
		vi.mocked(readFileSync).mockReturnValue("");
		vi.mocked(listRuns).mockReturnValue([]);
		vi.mocked(loadTaskConfig).mockImplementation(() => {
			throw new Error("no config");
		});
	});

	it("calls archiveRun with correct args", () => {
		vi.mocked(loadTaskConfig).mockReturnValueOnce({
			id: "my-task",
			name: "My Task",
			schedule: "* * * * *",
			timeout: 300,
			enabled: true,
			discovery: { command: "echo '[]'", item_key: "url" },
			model: "sonnet",
			prompt_mode: "per_item" as const,
			prompt: "",
			cleanup: { teardown: "rm -rf /tmp/test" },
			vars: { foo: "bar" },
		} as ReturnType<typeof loadTaskConfig>);
		vi.mocked(existsSync).mockReturnValueOnce(false);

		const softDelete = makeSoftDelete("/base", "/base/runs", "/base/.bin", {
			GLOBAL: "yes",
		});
		softDelete("/base/runs/my-task/run1");

		expect(archiveRun).toHaveBeenCalledWith(
			"/base/runs/my-task/run1",
			"/base/.bin",
			"my-task",
			"rm -rf /tmp/test",
			{ GLOBAL: "yes" },
			{ foo: "bar" },
			{},
			"/base",
		);
	});

	it("handles missing task config gracefully", () => {
		vi.mocked(loadTaskConfig).mockImplementationOnce(() => {
			throw new Error("not found");
		});
		vi.mocked(existsSync).mockReturnValueOnce(false);

		const softDelete = makeSoftDelete("/base", "/base/runs", "/base/.bin", {});
		expect(() => softDelete("/base/runs/my-task/run1")).not.toThrow();

		expect(archiveRun).toHaveBeenCalledWith(
			"/base/runs/my-task/run1",
			"/base/.bin",
			"my-task",
			undefined,
			{},
			{},
			{},
			"/base",
		);
	});

	it("skips teardown when another run shares the same item_key", () => {
		vi.mocked(loadTaskConfig).mockReturnValueOnce({
			id: "my-task",
			name: "My Task",
			schedule: "* * * * *",
			timeout: 300,
			enabled: true,
			discovery: { command: "echo '[]'", item_key: "url" },
			model: "sonnet",
			prompt_mode: "per_item" as const,
			prompt: "",
			cleanup: { teardown: "rm -rf /tmp/test" },
			vars: {},
		} as ReturnType<typeof loadTaskConfig>);
		vi.mocked(existsSync).mockReturnValueOnce(true);
		vi.mocked(readFileSync).mockReturnValueOnce(
			JSON.stringify({
				run: { item_key: "https://pr/1" },
				vars: { branch: "main" },
			}),
		);
		vi.mocked(listRuns).mockReturnValueOnce([
			{
				meta: {
					schema_version: 1,
					id: "run2",
					task: "my-task",
					status: "completed",
					url: null,
					item_key: "https://pr/1",
					started_at: "2026-01-01T00:00:00Z",
					finished_at: "2026-01-01T00:01:00Z",
					duration_seconds: 60,
					exit_code: 0,
				},
				dir: "/base/runs/other-task/run2",
				report: undefined,
			},
		] as ReturnType<typeof listRuns>);

		const softDelete = makeSoftDelete("/base", "/base/runs", "/base/.bin", {});
		softDelete("/base/runs/my-task/run1");

		expect(archiveRun).toHaveBeenCalledWith(
			"/base/runs/my-task/run1",
			"/base/.bin",
			"my-task",
			undefined,
			{},
			{},
			{ branch: "main" },
			"/base",
		);
	});

	it("runs teardown when no other run shares the same item_key", () => {
		vi.mocked(loadTaskConfig).mockReturnValueOnce({
			id: "my-task",
			name: "My Task",
			schedule: "* * * * *",
			timeout: 300,
			enabled: true,
			discovery: { command: "echo '[]'", item_key: "url" },
			model: "sonnet",
			prompt_mode: "per_item" as const,
			prompt: "",
			cleanup: { teardown: "rm -rf /tmp/test" },
			vars: {},
		} as ReturnType<typeof loadTaskConfig>);
		vi.mocked(existsSync).mockReturnValueOnce(true);
		vi.mocked(readFileSync).mockReturnValueOnce(
			JSON.stringify({ run: { item_key: "https://pr/1" }, vars: {} }),
		);
		vi.mocked(listRuns).mockReturnValueOnce([]);

		const softDelete = makeSoftDelete("/base", "/base/runs", "/base/.bin", {});
		softDelete("/base/runs/my-task/run1");

		expect(archiveRun).toHaveBeenCalledWith(
			"/base/runs/my-task/run1",
			"/base/.bin",
			"my-task",
			"rm -rf /tmp/test",
			{},
			{},
			{},
			"/base",
		);
	});

	it("runs teardown when item_key is null", () => {
		vi.mocked(loadTaskConfig).mockReturnValueOnce({
			id: "my-task",
			name: "My Task",
			schedule: "* * * * *",
			timeout: 300,
			enabled: true,
			discovery: { command: "echo '[]'", item_key: "url" },
			model: "sonnet",
			prompt_mode: "per_item" as const,
			prompt: "",
			cleanup: { teardown: "rm -rf /tmp/test" },
			vars: {},
		} as ReturnType<typeof loadTaskConfig>);
		vi.mocked(existsSync).mockReturnValueOnce(true);
		vi.mocked(readFileSync).mockReturnValueOnce(
			JSON.stringify({ run: { item_key: null }, vars: {} }),
		);

		const softDelete = makeSoftDelete("/base", "/base/runs", "/base/.bin", {});
		softDelete("/base/runs/my-task/run1");

		expect(listRuns).not.toHaveBeenCalled();
		expect(archiveRun).toHaveBeenCalledWith(
			"/base/runs/my-task/run1",
			"/base/.bin",
			"my-task",
			"rm -rf /tmp/test",
			{},
			{},
			{},
			"/base",
		);
	});
});

describe("makeStopTask", () => {
	it("marks processing runs as canceled", () => {
		vi.mocked(listRuns).mockReturnValueOnce([
			{
				meta: {
					schema_version: 1,
					id: "run1",
					task: "my-task",
					status: "processing",
					url: null,
					item_key: null,
					started_at: "2026-01-01T00:00:00Z",
					finished_at: "",
					duration_seconds: 0,
					exit_code: 0,
				},
				dir: "/base/runs/my-task/run1",
				report: undefined,
			},
			{
				meta: {
					schema_version: 1,
					id: "run2",
					task: "my-task",
					status: "completed",
					url: null,
					item_key: null,
					started_at: "2026-01-01T00:00:00Z",
					finished_at: "2026-01-01T00:01:00Z",
					duration_seconds: 60,
					exit_code: 0,
				},
				dir: "/base/runs/my-task/run2",
				report: undefined,
			},
		] as ReturnType<typeof listRuns>);

		const stopTask = makeStopTask("/base", "/base/runs", {});
		stopTask("my-task");

		expect(updateRunMeta).toHaveBeenCalledWith("/base/runs/my-task/run1", {
			status: "canceled",
		});
		expect(updateRunMeta).not.toHaveBeenCalledWith(
			"/base/runs/my-task/run2",
			expect.anything(),
		);
	});
});

describe("makeToggleTask", () => {
	it("does nothing when config file missing", () => {
		vi.mocked(existsSync).mockReturnValueOnce(false);

		const toggleTask = makeToggleTask("/base");
		toggleTask("no-such-task");

		expect(syncCommand).not.toHaveBeenCalled();
	});
});

describe("makeSpawnRun", () => {
	it("does not throw", () => {
		const spawnRun = makeSpawnRun("/base");
		expect(() => spawnRun("my-task")).not.toThrow();
	});
});
