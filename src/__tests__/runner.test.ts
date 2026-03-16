import { describe, it, expect } from "vitest";
import { parseClaudeOutput, executePrompt } from "../lib/runner.js";

describe("parseClaudeOutput", () => {
  it("detects NO_ACTION response", () => {
    const result = parseClaudeOutput("NO_ACTION");
    expect(result.status).toBe("no-action");
    expect(result.url).toBeNull();
  });

  it("extracts URL from first line", () => {
    const result = parseClaudeOutput("https://github.com/user/repo/pull/42\n\n## Review\nAll good");
    expect(result.status).toBe("completed");
    expect(result.url).toBe("https://github.com/user/repo/pull/42");
    expect(result.report).toContain("## Review");
  });

  it("handles output with no URL on first line", () => {
    const result = parseClaudeOutput("## Review\nSome content");
    expect(result.status).toBe("completed");
    expect(result.url).toBeNull();
  });
});

describe("executePrompt", () => {
  it("executes a command and captures output", () => {
    const result = executePrompt("test prompt", 30, "echo");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("test prompt");
  });

  it("returns error for failing command", () => {
    const result = executePrompt("test", 30, "false");
    expect(result.exitCode).not.toBe(0);
  });
});
