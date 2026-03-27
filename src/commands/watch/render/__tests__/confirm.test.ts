import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { State } from "../../state.js";
import { initialState } from "../../state.js";
import { renderConfirmRun } from "../confirm.js";

describe("renderConfirmRun", () => {
	let writeSpy: ReturnType<typeof vi.spyOn>;
	let state: State;

	beforeEach(() => {
		writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		Object.defineProperty(process.stdout, "rows", {
			value: 24,
			configurable: true,
		});
		Object.defineProperty(process.stdout, "columns", {
			value: 80,
			configurable: true,
		});

		state = {
			...initialState(),
			mode: "confirm-run",
			confirmTask: "my-task",
			confirmChoice: "yes",
			suspend: null,
			layoutMode: "horizontal",
			selected: new Set(),
			followBottom: true,
			flash: null,
		};
	});

	afterEach(() => {
		writeSpy.mockRestore();
	});

	it("shows the task name in the dialog", () => {
		renderConfirmRun(state);

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("my-task");
	});

	it("shows the Confirm title", () => {
		renderConfirmRun(state);

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Confirm");
	});

	it("shows Yes and No buttons", () => {
		renderConfirmRun(state);

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Yes");
		expect(output).toContain("No");
	});
});
