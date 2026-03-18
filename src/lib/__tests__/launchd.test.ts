import { describe, expect, it } from "vitest";
import {
	calendarIntervalsToCron,
	cronToCalendarIntervals,
} from "../launchd.js";

describe("cronToCalendarIntervals", () => {
	it("parses every minute (* * * * *)", () => {
		const result = cronToCalendarIntervals("* * * * *");
		expect(result).toEqual([{}]);
	});

	it("parses fixed minute (0 * * * *)", () => {
		const result = cronToCalendarIntervals("0 * * * *");
		expect(result).toEqual([{ Minute: 0 }]);
	});

	it("parses minute and hour (30 9 * * *)", () => {
		const result = cronToCalendarIntervals("30 9 * * *");
		expect(result).toEqual([{ Minute: 30, Hour: 9 }]);
	});

	it("parses step in minute field (*/30 * * * *)", () => {
		const result = cronToCalendarIntervals("*/30 * * * *");
		expect(result).toEqual([{ Minute: 0 }, { Minute: 30 }]);
	});

	it("parses step in hour field (0 */6 * * *)", () => {
		const result = cronToCalendarIntervals("0 */6 * * *");
		expect(result).toEqual([
			{ Minute: 0, Hour: 0 },
			{ Minute: 0, Hour: 6 },
			{ Minute: 0, Hour: 12 },
			{ Minute: 0, Hour: 18 },
		]);
	});

	it("treats */1 as wildcard", () => {
		const result = cronToCalendarIntervals("0 */1 * * *");
		expect(result).toEqual([{ Minute: 0 }]);
	});

	it("parses comma-separated values (0,15,30,45 * * * *)", () => {
		const result = cronToCalendarIntervals("0,15,30,45 * * * *");
		expect(result).toEqual([
			{ Minute: 0 },
			{ Minute: 15 },
			{ Minute: 30 },
			{ Minute: 45 },
		]);
	});

	it("parses range (0 9-17 * * *)", () => {
		const result = cronToCalendarIntervals("0 9-17 * * *");
		expect(result).toHaveLength(9);
		expect(result[0]).toEqual({ Minute: 0, Hour: 9 });
		expect(result[8]).toEqual({ Minute: 0, Hour: 17 });
	});

	it("parses weekday field (0 9 * * 1-5)", () => {
		const result = cronToCalendarIntervals("0 9 * * 1-5");
		expect(result).toHaveLength(5);
		expect(result[0]).toEqual({ Minute: 0, Hour: 9, Weekday: 1 });
		expect(result[4]).toEqual({ Minute: 0, Hour: 9, Weekday: 5 });
	});

	it("normalizes weekday 7 to 0 (Sunday)", () => {
		const result = cronToCalendarIntervals("0 0 * * 7");
		expect(result).toEqual([{ Minute: 0, Hour: 0, Weekday: 0 }]);
	});

	it("produces cartesian product for multiple expanded fields", () => {
		const result = cronToCalendarIntervals("0,30 9,17 * * *");
		expect(result).toHaveLength(4);
		expect(result).toContainEqual({ Minute: 0, Hour: 9 });
		expect(result).toContainEqual({ Minute: 30, Hour: 9 });
		expect(result).toContainEqual({ Minute: 0, Hour: 17 });
		expect(result).toContainEqual({ Minute: 30, Hour: 17 });
	});

	it("parses all five fields (0 9 1 6 3)", () => {
		const result = cronToCalendarIntervals("0 9 1 6 3");
		expect(result).toEqual([
			{ Minute: 0, Hour: 9, Day: 1, Month: 6, Weekday: 3 },
		]);
	});

	it("throws on invalid expression", () => {
		expect(() => cronToCalendarIntervals("bad")).toThrow(
			"Invalid cron expression",
		);
	});
});

describe("calendarIntervalsToCron", () => {
	it("converts empty dict to * * * * *", () => {
		expect(calendarIntervalsToCron([{}])).toBe("* * * * *");
	});

	it("converts empty array to * * * * *", () => {
		expect(calendarIntervalsToCron([])).toBe("* * * * *");
	});

	it("converts single minute to N * * * *", () => {
		expect(calendarIntervalsToCron([{ Minute: 0 }])).toBe("0 * * * *");
	});

	it("converts multiple minutes to comma-separated", () => {
		expect(calendarIntervalsToCron([{ Minute: 0 }, { Minute: 30 }])).toBe(
			"0,30 * * * *",
		);
	});

	it("converts minute + hour", () => {
		expect(calendarIntervalsToCron([{ Minute: 30, Hour: 9 }])).toBe(
			"30 9 * * *",
		);
	});

	it("converts multiple hour values", () => {
		expect(
			calendarIntervalsToCron([
				{ Minute: 0, Hour: 0 },
				{ Minute: 0, Hour: 6 },
				{ Minute: 0, Hour: 12 },
				{ Minute: 0, Hour: 18 },
			]),
		).toBe("0 0,6,12,18 * * *");
	});

	it("converts weekday intervals", () => {
		expect(
			calendarIntervalsToCron([
				{ Minute: 0, Hour: 9, Weekday: 1 },
				{ Minute: 0, Hour: 9, Weekday: 2 },
				{ Minute: 0, Hour: 9, Weekday: 3 },
			]),
		).toBe("0 9 * * 1,2,3");
	});

	it("converts all fields", () => {
		expect(
			calendarIntervalsToCron([
				{ Minute: 0, Hour: 9, Day: 1, Month: 6, Weekday: 3 },
			]),
		).toBe("0 9 1 6 3");
	});

	it("roundtrips with cronToCalendarIntervals", () => {
		const expressions = ["* * * * *", "0 * * * *", "30 9 * * *", "0 9 1 6 3"];
		for (const expr of expressions) {
			const intervals = cronToCalendarIntervals(expr);
			expect(calendarIntervalsToCron(intervals)).toBe(expr);
		}
	});
});
