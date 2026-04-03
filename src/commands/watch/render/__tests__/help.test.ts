import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HotkeyConfig } from "../../settings.js";
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
		renderHelp(0);

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Keybindings");
	});

	it("shows Navigation sections", () => {
		renderHelp(0);

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Navigation (Task List)");
		expect(output).toContain("Navigation (Detail Pane)");
	});

	it("shows key actions", () => {
		renderHelp(0);

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Move selection up / down");
		expect(output).toContain("Run selected task");
		expect(output).toContain("Toggle this help");
	});

	it("shows Actions section", () => {
		renderHelp(0);

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Actions");
	});

	it("scrolls content when scroll offset is provided", () => {
		Object.defineProperty(process.stdout, "rows", {
			value: 10,
			configurable: true,
		});

		renderHelp(0);
		const outputTop = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");

		writeSpy.mockClear();
		renderHelp(5);
		const outputScrolled = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");

		expect(outputTop).not.toEqual(outputScrolled);
	});
});

describe("custom hotkeys in help", () => {
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

	it("shows custom hotkeys section when hotkeys are provided", () => {
		const hotkeys: HotkeyConfig[] = [
			{
				key: "p",
				command: "cs h",
				description: "Open Claude in worktree",
			},
			{
				key: "o",
				command: "code {{tab_file_path}}",
				description: "Open file in VS Code",
			},
		];
		renderHelp(0, hotkeys);

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).toContain("Custom Hotkeys");
		expect(output).toContain("p");
		expect(output).toContain("Open Claude in worktree");
		expect(output).toContain("o");
		expect(output).toContain("Open file in VS Code");
	});

	it("omits custom hotkeys section when no hotkeys defined", () => {
		renderHelp(0, []);

		const output = writeSpy.mock.calls
			.map((c: unknown[]) => String(c[0]))
			.join("");
		expect(output).not.toContain("Custom Hotkeys");
	});
});
