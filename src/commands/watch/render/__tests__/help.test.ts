import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHelp } from "../help.js";

describe("renderHelp", () => {
	let writeSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		writeSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
		Object.defineProperty(process.stdout, "rows", {
			value: 40,
			configurable: true,
		});
	});

	afterEach(() => {
		writeSpy.mockRestore();
	});

	it("shows the Keybindings heading", () => {
		renderHelp();

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Keybindings");
	});

	it("shows Navigation section", () => {
		renderHelp();

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Navigation");
	});

	it("shows key actions", () => {
		renderHelp();

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Move selection up / down");
		expect(output).toContain("Run selected task");
		expect(output).toContain("Toggle this help");
	});

	it("shows File Tabs section", () => {
		renderHelp();

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("File Tabs");
	});

	it("shows Actions section", () => {
		renderHelp();

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Actions");
	});
});
