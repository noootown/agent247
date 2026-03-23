import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/report.js", () => ({
	listRuns: vi.fn(() => []),
}));
vi.mock("../../lib/bin.js", () => ({
	purgeBin: vi.fn(() => 0),
}));
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		rmSync: vi.fn(),
	};
});

import { rmSync } from "node:fs";
import { purgeBin } from "../../lib/bin.js";
import { listRuns } from "../../lib/report.js";
import { purgeCommand } from "../purge.js";

const mockListRuns = vi.mocked(listRuns);
const mockPurgeBin = vi.mocked(purgeBin);
const mockRmSync = vi.mocked(rmSync);

beforeEach(() => {
	vi.clearAllMocks();
	vi.spyOn(console, "log").mockImplementation(() => {});
});

function makeRun(dir: string, startedAt: string) {
	return {
		dir,
		meta: {
			schema_version: 1,
			id: "test",
			task: "task",
			status: "completed" as const,
			url: null,
			item_key: null,
			started_at: startedAt,
			finished_at: startedAt,
			duration_seconds: 0,
			exit_code: 0,
		},
	};
}

describe("purgeCommand", () => {
	it("deletes runs older than the given duration", () => {
		const oldDate = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
		const oldRun = makeRun("/base/runs/task/old", oldDate);
		mockListRuns.mockReturnValue([oldRun]);

		purgeCommand("/base", "7d");

		expect(mockRmSync).toHaveBeenCalledWith("/base/runs/task/old", {
			recursive: true,
			force: true,
		});
		expect(console.log).toHaveBeenCalledWith("Cleaned 1 run(s).");
	});

	it("does not delete recent runs", () => {
		const recentDate = new Date(Date.now() - 1000).toISOString();
		const recentRun = makeRun("/base/runs/task/recent", recentDate);
		mockListRuns.mockReturnValue([recentRun]);

		purgeCommand("/base", "7d");

		expect(mockRmSync).not.toHaveBeenCalled();
	});

	it("logs when no runs match", () => {
		mockListRuns.mockReturnValue([]);

		purgeCommand("/base", "7d");

		expect(console.log).toHaveBeenCalledWith(
			"No runs matching criteria to clean.",
		);
	});

	it("throws on invalid duration format", () => {
		expect(() => purgeCommand("/base", "abc")).toThrow("Invalid duration: abc");
		expect(() => purgeCommand("/base", "7x")).toThrow("Invalid duration: 7x");
	});

	it("calls purgeBin", () => {
		mockListRuns.mockReturnValue([]);
		mockPurgeBin.mockReturnValue(3);

		purgeCommand("/base", "1d");

		expect(mockPurgeBin).toHaveBeenCalledWith("/base");
		expect(console.log).toHaveBeenCalledWith(
			"Purged 3 deleted run(s) from bin.",
		);
	});
});
