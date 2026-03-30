import { describe, expect, it } from "vitest";
import { applyScroll, ScrollDirection } from "../scroll.js";

describe("applyScroll", () => {
	it("UP decrements scrollY by 1", () => {
		expect(applyScroll(ScrollDirection.UP, 5, 0, 10)).toEqual({
			scrollY: 4,
			scrollX: 0,
		});
	});

	it("UP at scrollY=0 stays at 0", () => {
		expect(applyScroll(ScrollDirection.UP, 0, 0, 10)).toEqual({
			scrollY: 0,
			scrollX: 0,
		});
	});

	it("DOWN increments scrollY by 1", () => {
		expect(applyScroll(ScrollDirection.DOWN, 5, 0, 10)).toEqual({
			scrollY: 6,
			scrollX: 0,
		});
	});

	it("DOWN at scrollY=maxY stays at maxY", () => {
		expect(applyScroll(ScrollDirection.DOWN, 10, 0, 10)).toEqual({
			scrollY: 10,
			scrollX: 0,
		});
	});

	it("LEFT decrements scrollX by 4", () => {
		expect(applyScroll(ScrollDirection.LEFT, 0, 8, 10)).toEqual({
			scrollY: 0,
			scrollX: 4,
		});
	});

	it("LEFT at scrollX=0 stays at 0", () => {
		expect(applyScroll(ScrollDirection.LEFT, 0, 0, 10)).toEqual({
			scrollY: 0,
			scrollX: 0,
		});
	});

	it("LEFT clamps to 0 when scrollX < 4", () => {
		expect(applyScroll(ScrollDirection.LEFT, 0, 2, 10)).toEqual({
			scrollY: 0,
			scrollX: 0,
		});
	});

	it("RIGHT increments scrollX by 4", () => {
		expect(applyScroll(ScrollDirection.RIGHT, 0, 0, 10)).toEqual({
			scrollY: 0,
			scrollX: 4,
		});
	});

	it("HOME sets scrollY to 0", () => {
		expect(applyScroll(ScrollDirection.HOME, 5, 8, 10)).toEqual({
			scrollY: 0,
			scrollX: 8,
		});
	});

	it("END sets scrollY to maxY", () => {
		expect(applyScroll(ScrollDirection.END, 0, 8, 10)).toEqual({
			scrollY: 10,
			scrollX: 8,
		});
	});
});
