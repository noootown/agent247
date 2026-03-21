import { describe, expect, it } from "vitest";
import {
	fitToWidth,
	formatAgo,
	formatTime,
	scrollAnsi,
	stripAnsi,
} from "../ansi.js";

describe("stripAnsi", () => {
	it("returns plain text unchanged", () => {
		expect(stripAnsi("hello")).toBe("hello");
	});
	it("removes color codes", () => {
		expect(stripAnsi("\x1B[31mred\x1B[0m")).toBe("red");
	});
	it("removes OSC hyperlink sequences", () => {
		expect(stripAnsi("\x1B]8;;https://example.com\x07link\x1B]8;;\x07")).toBe(
			"link",
		);
	});
	it("removes mixed sequences", () => {
		expect(stripAnsi("\x1B[1mBold\x1B[0m and \x1B[32mgreen\x1B[0m")).toBe(
			"Bold and green",
		);
	});
});

describe("scrollAnsi", () => {
	it("returns text unchanged when skip is 0", () => {
		expect(scrollAnsi("hello", 0)).toBe("hello");
	});
	it("skips visible characters", () => {
		expect(scrollAnsi("hello", 3)).toBe("lo");
	});
	it("skips past ANSI sequences without counting them", () => {
		const colored = "\x1B[31mhello\x1B[0m";
		const result = scrollAnsi(colored, 3);
		expect(stripAnsi(result)).toBe("lo");
	});
	it("preserves active color state at the boundary", () => {
		const colored = "\x1B[31mhello\x1B[0m";
		const result = scrollAnsi(colored, 3);
		expect(result.startsWith("\x1B[31m")).toBe(true);
	});
	it("returns empty string when skip exceeds text length", () => {
		expect(scrollAnsi("hi", 10)).toBe("");
	});
});

describe("fitToWidth", () => {
	it("pads short strings to the target width", () => {
		const result = fitToWidth("hi", 5);
		expect(stripAnsi(result).length).toBe(5);
		expect(stripAnsi(result)).toBe("hi   ");
	});
	it("returns text unchanged when exactly at width", () => {
		expect(stripAnsi(fitToWidth("hello", 5))).toBe("hello");
	});
	it("truncates long strings with an ellipsis character", () => {
		const result = fitToWidth("hello world", 7);
		expect(stripAnsi(result).length).toBe(7);
		expect(stripAnsi(result)).toMatch(/…$/);
	});
	it("measures visible length correctly when text has ANSI codes", () => {
		const colored = "\x1B[31mhello\x1B[0m";
		const result = fitToWidth(colored, 8);
		expect(stripAnsi(result).length).toBe(8);
	});
});

describe("formatAgo", () => {
	it("shows seconds for recent timestamps", () => {
		expect(formatAgo(Date.now() - 30_000)).toBe("30s ago");
	});
	it("shows minutes for timestamps 1–59 min ago", () => {
		expect(formatAgo(Date.now() - 5 * 60_000)).toBe("5m ago");
	});
	it("shows hours for timestamps 1–23h ago", () => {
		expect(formatAgo(Date.now() - 3 * 3_600_000)).toBe("3h ago");
	});
	it("shows days for timestamps ≥ 24h ago", () => {
		expect(formatAgo(Date.now() - 2 * 86_400_000)).toBe("2d ago");
	});
});

describe("formatTime", () => {
	it("formats an ISO string as YYYY/MM/DD HH:MM:SS", () => {
		const result = formatTime("2026-03-17T00:00:00Z");
		expect(result).toMatch(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}$/);
	});
});
