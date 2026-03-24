import { describe, expect, it } from "vitest";
import {
	executePrompt,
	extractTextFromJson,
	parseClaudeOutput,
} from "../runner.js";

describe("parseClaudeOutput", () => {
	it("treats NO_ACTION as completed", () => {
		const result = parseClaudeOutput("NO_ACTION");
		expect(result.status).toBe("completed");
		expect(result.url).toBeNull();
	});

	it("extracts URL from first line", () => {
		const result = parseClaudeOutput(
			"https://github.com/user/repo/pull/42\n\n## Review\nAll good",
		);
		expect(result.status).toBe("completed");
		expect(result.url).toBe("https://github.com/user/repo/pull/42");
		expect(result.report).toContain("## Review");
	});

	it("handles output with no URL on first line", () => {
		const result = parseClaudeOutput("## Review\nSome content");
		expect(result.status).toBe("completed");
		expect(result.url).toBeNull();
	});

	it("trims whitespace from output", () => {
		const result = parseClaudeOutput("  \n  hello world  \n  ");
		expect(result.report).toBe("hello world");
	});

	it("handles empty string", () => {
		const result = parseClaudeOutput("");
		expect(result.status).toBe("completed");
		expect(result.url).toBeNull();
		expect(result.report).toBe("");
	});

	it("extracts URL even if line has surrounding text", () => {
		const result = parseClaudeOutput("Visit https://example.com for info");
		expect(result.url).toBe("https://example.com");
	});

	it("extracts URL from later lines if first line has no URL", () => {
		const result = parseClaudeOutput(
			"All phases complete.\n\n**PR**: https://github.com/org/repo/pull/42\n\nSummary",
		);
		expect(result.url).toBe("https://github.com/org/repo/pull/42");
	});

	it("does not scan beyond first 5 lines", () => {
		const result = parseClaudeOutput(
			"line1\nline2\nline3\nline4\nline5\nhttps://example.com",
		);
		expect(result.url).toBeNull();
	});

	it("extracts http URL (not just https)", () => {
		const result = parseClaudeOutput("http://example.com\ndetails");
		expect(result.url).toBe("http://example.com");
	});
});

describe("extractTextFromJson", () => {
	it("extracts result field from valid JSON", () => {
		const json = JSON.stringify({ result: "hello world" });
		expect(extractTextFromJson(json)).toBe("hello world");
	});

	it("returns raw string when JSON has no result field", () => {
		const json = JSON.stringify({ other: "value" });
		expect(extractTextFromJson(json)).toBe(json);
	});

	it("returns raw string for invalid JSON", () => {
		expect(extractTextFromJson("not json")).toBe("not json");
	});

	it("returns raw string when result is not a string", () => {
		const json = JSON.stringify({ result: 42 });
		expect(extractTextFromJson(json)).toBe(json);
	});
});

describe("executePrompt", () => {
	it("executes a command and captures output", async () => {
		const result = await executePrompt("test prompt", 30, "echo");
		expect(result.exitCode).toBe(0);
		expect(result.stdout).toContain("test prompt");
	});

	it("returns error for failing command", async () => {
		const result = await executePrompt("test", 30, "false");
		expect(result.exitCode).not.toBe(0);
	});

	it("times out and sets timedOut flag", async () => {
		const result = await executePrompt("10", 1, "sleep");
		expect(result.timedOut).toBe(true);
		expect(result.exitCode).not.toBe(0);
	}, 15000);

	it("returns empty transcript for non-claude commands", async () => {
		const result = await executePrompt("hello", 30, "echo");
		expect(result.transcript).toBe("");
		expect(result.rawJson).toBeNull();
	});

	it("captures stderr from failing commands", async () => {
		const result = await executePrompt("-c 'echo err >&2; exit 1'", 30, "bash");
		expect(result.exitCode).not.toBe(0);
	});

	it("resolves with error when command does not exist", async () => {
		const result = await executePrompt("arg", 30, "nonexistent_command_xyz");
		expect(result.exitCode).toBe(1);
		expect(result.stderr).toContain("Failed to spawn process");
		expect(result.timedOut).toBe(false);
	});
});
