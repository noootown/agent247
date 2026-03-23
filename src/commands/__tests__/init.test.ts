import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { initCommand } from "../init.js";

describe("initCommand", () => {
	let tmp: string;

	beforeEach(() => {
		tmp = mkdtempSync(join(tmpdir(), "init-test-"));
		vi.spyOn(console, "log").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		rmSync(tmp, { recursive: true, force: true });
	});

	it("creates workspace directories (tasks, runs)", () => {
		const ws = join(tmp, "ws");
		initCommand(ws);

		expect(existsSync(join(ws, "tasks"))).toBe(true);
		expect(existsSync(join(ws, "runs"))).toBe(true);
	});

	it("creates vars.yaml with template content containing bot_name", () => {
		const ws = join(tmp, "ws");
		initCommand(ws);

		const vars = readFileSync(join(ws, "vars.yaml"), "utf-8");
		expect(vars).toContain("bot_name");
	});

	it("creates .gitignore", () => {
		const ws = join(tmp, "ws");
		initCommand(ws);

		expect(existsSync(join(ws, ".gitignore"))).toBe(true);
	});

	it("is idempotent — does not overwrite existing workspace", () => {
		const ws = join(tmp, "ws");
		initCommand(ws);

		const varsContent = readFileSync(join(ws, "vars.yaml"), "utf-8");

		// Run again
		initCommand(ws);

		expect(console.log).toHaveBeenCalledWith(
			expect.stringContaining("already exists"),
		);
		// vars.yaml content unchanged
		expect(readFileSync(join(ws, "vars.yaml"), "utf-8")).toBe(varsContent);
	});
});
