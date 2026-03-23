import { execSync } from "node:child_process";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { execHook } from "../hooks.js";
import type { Logger } from "../logger.js";

vi.mock("node:child_process", () => ({
	execSync: vi.fn(),
}));

function makeLogger(): Logger & { calls: string[] } {
	const calls: string[] = [];
	return {
		log: (msg: string) => calls.push(`INFO: ${msg}`),
		error: (msg: string) => calls.push(`ERROR: ${msg}`),
		getEntries: () => [...calls],
		calls,
	};
}

describe("execHook", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("executes the command via execSync with correct options", () => {
		const logger = makeLogger();
		execHook("echo hello", "/tmp/cwd", logger);
		expect(execSync).toHaveBeenCalledWith("echo hello", {
			encoding: "utf-8",
			timeout: 60_000,
			shell: "/bin/bash",
			stdio: "pipe",
			cwd: "/tmp/cwd",
		});
	});

	it("passes undefined cwd when not provided", () => {
		const logger = makeLogger();
		execHook("echo hello", undefined, logger);
		expect(execSync).toHaveBeenCalledWith(
			"echo hello",
			expect.objectContaining({ cwd: undefined }),
		);
	});

	it("logs error and re-throws on failure", () => {
		const logger = makeLogger();
		const err = new Error("command failed");
		vi.mocked(execSync).mockImplementation(() => {
			throw err;
		});
		expect(() => execHook("bad-cmd", "/tmp", logger)).toThrow("command failed");
		expect(logger.calls).toContain("ERROR: Hook failed: Error: command failed");
	});

	it("does not log on success", () => {
		const logger = makeLogger();
		vi.mocked(execSync).mockReturnValue("");
		execHook("echo ok", "/tmp", logger);
		expect(logger.calls.filter((c) => c.startsWith("ERROR"))).toHaveLength(0);
	});
});
