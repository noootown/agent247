import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all dependencies before importing the module under test
vi.mock("ulid", () => ({ ulid: vi.fn(() => "MOCK_ULID_001") }));
vi.mock("../../lib/bin.js", () => ({ purgeBin: vi.fn() }));
vi.mock("../../lib/cleanup.js", () => ({ cleanupRuns: vi.fn() }));
vi.mock("../../lib/config.js", () => ({
	loadTaskConfig: vi.fn(),
	loadGlobalVars: vi.fn(() => ({})),
	loadEnvLocalRaw: vi.fn(() => ({})),
}));
vi.mock("../../lib/dedup.js", () => ({ filterNewItems: vi.fn() }));
vi.mock("../../lib/discovery.js", () => ({ discoverItems: vi.fn() }));
vi.mock("../../lib/hooks.js", () => ({ execHook: vi.fn() }));
vi.mock("../../lib/lock.js", () => ({
	acquireLock: vi.fn(() => true),
	releaseLock: vi.fn(),
}));
vi.mock("../../lib/logger.js", () => ({
	createLogger: vi.fn(() => ({
		log: vi.fn(),
		error: vi.fn(),
		getEntries: vi.fn(() => []),
	})),
}));
vi.mock("../../lib/report.js", () => ({
	writeRun: vi.fn(),
	listRuns: vi.fn(() => []),
}));
vi.mock("../../lib/runner.js", () => ({
	executePrompt: vi.fn(),
	extractTextFromJson: vi.fn((json: string) => json),
	parseClaudeOutput: vi.fn(() => ({
		status: "completed",
		url: null,
		report: "done",
	})),
}));
vi.mock("../../lib/redact.js", () => ({
	buildSecretMap: vi.fn(() => new Map()),
	redact: vi.fn((text: string) => text),
}));
vi.mock("../../lib/task-cache.js", () => ({
	writeTaskCache: vi.fn(),
}));
vi.mock("../../lib/template.js", () => ({
	render: vi.fn((...args: string[]) => args[0]),
}));
vi.mock("node:fs", async (importOriginal) => {
	const actual = await importOriginal<typeof import("node:fs")>();
	return {
		...actual,
		mkdirSync: vi.fn(),
		writeFileSync: vi.fn(),
		existsSync: vi.fn(() => false),
		readdirSync: vi.fn(() => []),
		readFileSync: vi.fn(() => ""),
	};
});

import type { TaskConfig } from "../../lib/config.js";
import { loadGlobalVars, loadTaskConfig } from "../../lib/config.js";
import { filterNewItems } from "../../lib/dedup.js";
import { discoverItems } from "../../lib/discovery.js";
import { acquireLock, releaseLock } from "../../lib/lock.js";
import { writeRun } from "../../lib/report.js";
import { executePrompt } from "../../lib/runner.js";
import { runCommand } from "../run.js";

function baseConfig(overrides?: Partial<TaskConfig>): TaskConfig {
	return {
		id: "test-task",
		name: "Test Task",
		schedule: "*/5 * * * *",
		timeout: 60,
		enabled: true,
		prompt: "Do something {{item}}",
		model: "sonnet",
		prompt_mode: "per_item",
		parallel: false,
		bypass_dedup: false,
		...overrides,
	};
}

describe("runCommand", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(acquireLock).mockReturnValue(true);
		vi.mocked(loadGlobalVars).mockReturnValue({});
	});

	it("returns early when lock is already held", async () => {
		vi.mocked(acquireLock).mockReturnValue(false);
		vi.mocked(loadTaskConfig).mockReturnValue(baseConfig());
		await runCommand("test-task", "/tmp/base");
		expect(writeRun).not.toHaveBeenCalled();
		expect(releaseLock).not.toHaveBeenCalled();
	});

	it("writes error run on discovery failure", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(
			baseConfig({
				discovery: { command: "find-items", item_key: "url" },
			}),
		);
		vi.mocked(discoverItems).mockImplementation(() => {
			throw new Error("discovery boom");
		});
		await runCommand("test-task", "/tmp/base");
		expect(writeRun).toHaveBeenCalledTimes(1);
		const call = vi.mocked(writeRun).mock.calls[0];
		expect(call[1].meta.status).toBe("error");
		expect(releaseLock).toHaveBeenCalled();
	});

	it("writes cache when all items are deduped (no run created)", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(
			baseConfig({
				discovery: { command: "find-items", item_key: "url" },
			}),
		);
		vi.mocked(discoverItems).mockReturnValue([{ url: "a" }, { url: "b" }]);
		vi.mocked(filterNewItems).mockReturnValue([]);
		await runCommand("test-task", "/tmp/base");
		expect(writeRun).not.toHaveBeenCalled();
		const { writeTaskCache } = await import("../../lib/task-cache.js");
		expect(writeTaskCache).toHaveBeenCalled();
	});

	it("runs per_item sequential for each new item", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(
			baseConfig({
				discovery: { command: "find", item_key: "url" },
			}),
		);
		vi.mocked(discoverItems).mockReturnValue([{ url: "a" }, { url: "b" }]);
		vi.mocked(filterNewItems).mockReturnValue([{ url: "a" }, { url: "b" }]);
		vi.mocked(executePrompt).mockResolvedValue({
			exitCode: 0,
			stdout: "done",
			stderr: "",
			rawJson: null,
			transcript: "",
			timedOut: false,
		});
		await runCommand("test-task", "/tmp/base");
		// 2 items × 3 writeRun calls each (initial + prompt + final) = 6
		expect(vi.mocked(writeRun).mock.calls.length).toBe(6);
	});

	it("runs per_item parallel when config.parallel is true", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(
			baseConfig({
				discovery: { command: "find", item_key: "url" },
				parallel: true,
			}),
		);
		vi.mocked(discoverItems).mockReturnValue([{ url: "a" }]);
		vi.mocked(filterNewItems).mockReturnValue([{ url: "a" }]);
		vi.mocked(executePrompt).mockResolvedValue({
			exitCode: 0,
			stdout: "done",
			stderr: "",
			rawJson: null,
			transcript: "",
			timedOut: false,
		});
		await runCommand("test-task", "/tmp/base");
		expect(executePrompt).toHaveBeenCalledTimes(1);
	});

	it("runs batch mode with all items at once", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(
			baseConfig({
				prompt_mode: "batch",
				discovery: { command: "find", item_key: "url" },
			}),
		);
		vi.mocked(discoverItems).mockReturnValue([{ url: "a" }, { url: "b" }]);
		vi.mocked(filterNewItems).mockReturnValue([{ url: "a" }, { url: "b" }]);
		vi.mocked(executePrompt).mockResolvedValue({
			exitCode: 0,
			stdout: "done",
			stderr: "",
			rawJson: null,
			transcript: "",
			timedOut: false,
		});
		await runCommand("test-task", "/tmp/base");
		expect(executePrompt).toHaveBeenCalledTimes(1);
	});

	it("always releases lock in finally block", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(baseConfig());
		vi.mocked(filterNewItems).mockReturnValue([{ url: "a" }]);
		vi.mocked(executePrompt).mockRejectedValue(new Error("boom"));
		try {
			await runCommand("test-task", "/tmp/base");
		} catch {}
		expect(releaseLock).toHaveBeenCalledWith("test-task", "/tmp/base");
	});

	it("runs without discovery — single empty item, bypass dedup", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(baseConfig());
		vi.mocked(filterNewItems).mockReturnValue([{}]);
		vi.mocked(executePrompt).mockResolvedValue({
			exitCode: 0,
			stdout: "done",
			stderr: "",
			rawJson: null,
			transcript: "",
			timedOut: false,
		});
		await runCommand("test-task", "/tmp/base");
		expect(discoverItems).not.toHaveBeenCalled();
		expect(executePrompt).toHaveBeenCalledTimes(1);
	});

	it("filters discovery items to matching item_key when rerunItemKey is provided", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(
			baseConfig({
				discovery: { command: "find-items", item_key: "identifier" },
			}),
		);
		vi.mocked(discoverItems).mockReturnValue([
			{ identifier: "JUS-100", title: "First" },
			{ identifier: "JUS-200", title: "Second" },
			{ identifier: "JUS-300", title: "Third" },
		]);
		vi.mocked(filterNewItems).mockImplementation((_, __, items) => items);
		vi.mocked(executePrompt).mockResolvedValue({
			exitCode: 0,
			stdout: "done",
			stderr: "",
			rawJson: '{"result":"done"}',
			transcript: "",
			timedOut: false,
		});
		await runCommand("test-task", "/tmp/base", "JUS-200");
		expect(executePrompt).toHaveBeenCalledTimes(1);
	});

	it("skips dedup when rerunItemKey is provided", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(
			baseConfig({
				discovery: { command: "find-items", item_key: "identifier" },
				bypass_dedup: false,
			}),
		);
		vi.mocked(discoverItems).mockReturnValue([
			{ identifier: "JUS-200", title: "Second" },
		]);
		vi.mocked(filterNewItems).mockReturnValue([]);
		vi.mocked(executePrompt).mockResolvedValue({
			exitCode: 0,
			stdout: "done",
			stderr: "",
			rawJson: '{"result":"done"}',
			transcript: "",
			timedOut: false,
		});
		await runCommand("test-task", "/tmp/base", "JUS-200");
		expect(filterNewItems).not.toHaveBeenCalled();
		expect(executePrompt).toHaveBeenCalledTimes(1);
	});
});

describe("executeForItem (via runCommand)", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(acquireLock).mockReturnValue(true);
		vi.mocked(loadGlobalVars).mockReturnValue({});
	});

	it("writes error run on non-zero exit", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(baseConfig());
		vi.mocked(filterNewItems).mockReturnValue([{}]);
		vi.mocked(executePrompt).mockResolvedValue({
			exitCode: 1,
			stdout: "",
			stderr: "fail",
			rawJson: null,
			transcript: "",
			timedOut: false,
		});
		await runCommand("test-task", "/tmp/base");
		const writeCalls = vi.mocked(writeRun).mock.calls;
		const finalCall = writeCalls[writeCalls.length - 1];
		expect(finalCall[1].meta.status).toBe("error");
		expect(finalCall[1].meta.exit_code).toBe(1);
	});

	it("writes success run with parsed output", async () => {
		vi.mocked(loadTaskConfig).mockReturnValue(baseConfig());
		vi.mocked(filterNewItems).mockReturnValue([{}]);
		vi.mocked(executePrompt).mockResolvedValue({
			exitCode: 0,
			stdout: "completed output",
			stderr: "",
			rawJson: null,
			transcript: "",
			timedOut: false,
		});
		await runCommand("test-task", "/tmp/base");
		const writeCalls = vi.mocked(writeRun).mock.calls;
		const finalCall = writeCalls[writeCalls.length - 1];
		expect(finalCall[1].meta.status).toBe("completed");
	});
});
