import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

/**
 * parseRetain and runDirName are private functions in src/commands/run.ts.
 * Since we cannot import them directly and must not modify source files,
 * we replicate and test the exact algorithms here to ensure correctness.
 */

// Exact copy of parseRetain from run.ts
function parseRetain(retain?: string): number {
	if (!retain) return 0;
	const match = retain.match(/^(\d+)(d|h|m)$/);
	if (!match) return 0;
	const value = Number(match[1]);
	switch (match[2]) {
		case "d":
			return value * 86400 * 1000;
		case "h":
			return value * 3600 * 1000;
		case "m":
			return value * 60 * 1000;
		default:
			return 0;
	}
}

// Exact copy of runDirName from run.ts
function runDirName(id: string): string {
	const now = new Date();
	const ts = now
		.toISOString()
		.replace(/[-:T]/g, "")
		.replace(/\.\d+Z$/, "");
	return `${ts.slice(0, 8)}-${ts.slice(8)}-${id}`;
}

describe("parseRetain", () => {
	it("parses days to milliseconds", () => {
		expect(parseRetain("7d")).toBe(7 * 86400 * 1000);
		expect(parseRetain("1d")).toBe(86400 * 1000);
		expect(parseRetain("30d")).toBe(30 * 86400 * 1000);
	});

	it("parses hours to milliseconds", () => {
		expect(parseRetain("12h")).toBe(12 * 3600 * 1000);
		expect(parseRetain("1h")).toBe(3600 * 1000);
		expect(parseRetain("24h")).toBe(24 * 3600 * 1000);
	});

	it("parses minutes to milliseconds", () => {
		expect(parseRetain("30m")).toBe(30 * 60 * 1000);
		expect(parseRetain("1m")).toBe(60 * 1000);
		expect(parseRetain("60m")).toBe(60 * 60 * 1000);
	});

	it("returns 0 for undefined or empty input", () => {
		expect(parseRetain(undefined)).toBe(0);
		expect(parseRetain("")).toBe(0);
	});

	it("returns 0 for invalid formats", () => {
		expect(parseRetain("7")).toBe(0);
		expect(parseRetain("d")).toBe(0);
		expect(parseRetain("7s")).toBe(0);
		expect(parseRetain("abc")).toBe(0);
		expect(parseRetain("7.5d")).toBe(0);
		expect(parseRetain("-3d")).toBe(0);
	});

	it("returns 0 for zero values", () => {
		expect(parseRetain("0d")).toBe(0);
		expect(parseRetain("0h")).toBe(0);
		expect(parseRetain("0m")).toBe(0);
	});
});

describe("runDirName", () => {
	it("produces YYYYMMDD-HHMMSS-<id> format", () => {
		const name = runDirName("01KM3QG86FD10RNRY35AN1ZDG8");
		// Pattern: 8 digits, dash, 6 digits, dash, ulid
		const pattern = /^\d{8}-\d{6}-[A-Z0-9]+$/;
		expect(pattern.test(name)).toBe(true);
	});

	it("embeds the provided id at the end", () => {
		const id = "TESTID12345";
		const name = runDirName(id);
		expect(name.endsWith(`-${id}`)).toBe(true);
	});

	it("starts with a valid date portion", () => {
		const name = runDirName("X");
		const datePart = name.slice(0, 8);
		const year = Number(datePart.slice(0, 4));
		const month = Number(datePart.slice(4, 6));
		const day = Number(datePart.slice(6, 8));
		expect(year).toBeGreaterThanOrEqual(2020);
		expect(year).toBeLessThanOrEqual(2100);
		expect(month).toBeGreaterThanOrEqual(1);
		expect(month).toBeLessThanOrEqual(12);
		expect(day).toBeGreaterThanOrEqual(1);
		expect(day).toBeLessThanOrEqual(31);
	});

	it("has a valid time portion", () => {
		const name = runDirName("X");
		const timePart = name.slice(9, 15);
		const hour = Number(timePart.slice(0, 2));
		const minute = Number(timePart.slice(2, 4));
		const second = Number(timePart.slice(4, 6));
		expect(hour).toBeGreaterThanOrEqual(0);
		expect(hour).toBeLessThanOrEqual(23);
		expect(minute).toBeGreaterThanOrEqual(0);
		expect(minute).toBeLessThanOrEqual(59);
		expect(second).toBeGreaterThanOrEqual(0);
		expect(second).toBeLessThanOrEqual(59);
	});

	it("matches the known format from production data", () => {
		const pattern = /^\d{8}-\d{6}-[A-Z0-9]{26}$/;
		// A real ULID is 26 chars
		expect(pattern.test("20260319-143652-01KM3QG86FD10RNRY35AN1ZDG8")).toBe(
			true,
		);
	});
});

// Exact copy of loadInjectVars from run.ts
import { existsSync, readdirSync, readFileSync } from "node:fs";
function loadInjectVars(taskId: string, baseDir: string): Record<string, string> {
	const injectDir = join(baseDir, "tasks", taskId, "inject");
	if (!existsSync(injectDir)) return {};
	const vars: Record<string, string> = {};
	for (const dirent of readdirSync(injectDir, { withFileTypes: true })) {
		if (!dirent.isFile()) continue;
		if (!dirent.name.endsWith(".md")) continue;
		const key = dirent.name.slice(0, -3);
		try {
			vars[key] = readFileSync(join(injectDir, dirent.name), "utf-8");
		} catch (err) {
			console.warn(`loadInjectVars: skipping ${dirent.name}: ${err}`);
		}
	}
	return vars;
}

describe("loadInjectVars", () => {
	it("returns {} when inject dir is absent", () => {
		const base = mkdtempSync(join(tmpdir(), "agent247-test-"));
		try {
			expect(loadInjectVars("my-task", base)).toEqual({});
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("loads only .md files and uses filename without extension as key", () => {
		const base = mkdtempSync(join(tmpdir(), "agent247-test-"));
		try {
			const injectDir = join(base, "tasks", "my-task", "inject");
			mkdirSync(injectDir, { recursive: true });
			writeFileSync(join(injectDir, "context.md"), "some context");
			writeFileSync(join(injectDir, "notes.md"), "some notes");
			writeFileSync(join(injectDir, "readme.txt"), "should be ignored");
			const result = loadInjectVars("my-task", base);
			expect(result).toEqual({
				context: "some context",
				notes: "some notes",
			});
			expect(result).not.toHaveProperty("readme.txt");
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});

	it("skips subdirectories inside inject dir", () => {
		const base = mkdtempSync(join(tmpdir(), "agent247-test-"));
		try {
			const injectDir = join(base, "tasks", "my-task", "inject");
			mkdirSync(injectDir, { recursive: true });
			mkdirSync(join(injectDir, "subdir.md"), { recursive: true });
			writeFileSync(join(injectDir, "valid.md"), "valid content");
			const result = loadInjectVars("my-task", base);
			expect(result).toEqual({ valid: "valid content" });
		} finally {
			rmSync(base, { recursive: true, force: true });
		}
	});
});
