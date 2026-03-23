import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../lib/config.js", () => ({
	listTasks: vi.fn(() => []),
}));
vi.mock("../../lib/launchd.js", () => ({
	syncLaunchd: vi.fn(),
}));
vi.mock("node:fs", () => ({
	existsSync: vi.fn(() => false),
	readFileSync: vi.fn(() => ""),
	writeFileSync: vi.fn(),
	appendFileSync: vi.fn(),
}));

import { listTasks } from "../../lib/config.js";
import { syncLaunchd } from "../../lib/launchd.js";
import { syncCommand } from "../sync.js";

const mockedListTasks = vi.mocked(listTasks);
const mockedSyncLaunchd = vi.mocked(syncLaunchd);

describe("syncCommand", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.spyOn(console, "log").mockImplementation(() => {});
		mockedListTasks.mockReturnValue([]);
	});

	it("logs message when no enabled tasks", () => {
		mockedListTasks.mockReturnValue([]);

		syncCommand("/tmp/test-base");

		expect(console.log).toHaveBeenCalledWith(
			"No enabled tasks. Removed all launch agents.",
		);
	});

	it("calls syncLaunchd with enabled tasks only", () => {
		mockedListTasks.mockReturnValue([
			{
				id: "task-a",
				config: {
					name: "Task A",
					enabled: true,
					schedule: "0 * * * *",
				} as ReturnType<typeof listTasks>[number]["config"],
			},
			{
				id: "task-b",
				config: {
					name: "Task B",
					enabled: false,
					schedule: "0 12 * * *",
				} as ReturnType<typeof listTasks>[number]["config"],
			},
		]);

		syncCommand("/tmp/test-base");

		expect(mockedSyncLaunchd).toHaveBeenCalledTimes(1);
		const enabledArg = mockedSyncLaunchd.mock.calls[0][0];
		expect(enabledArg).toEqual([
			{ id: "task-a", name: "Task A", schedule: "0 * * * *" },
		]);
	});

	it("logs synced task count", () => {
		mockedListTasks.mockReturnValue([
			{
				id: "task-a",
				config: {
					name: "Task A",
					enabled: true,
					schedule: "0 * * * *",
				} as ReturnType<typeof listTasks>[number]["config"],
			},
			{
				id: "task-b",
				config: {
					name: "Task B",
					enabled: true,
					schedule: "30 8 * * 1",
				} as ReturnType<typeof listTasks>[number]["config"],
			},
		]);

		syncCommand("/tmp/test-base");

		expect(console.log).toHaveBeenCalledWith("Synced 2 task(s) to launchd:");
		expect(console.log).toHaveBeenCalledWith("  task-a — 0 * * * *");
		expect(console.log).toHaveBeenCalledWith("  task-b — 30 8 * * 1");
	});
});
