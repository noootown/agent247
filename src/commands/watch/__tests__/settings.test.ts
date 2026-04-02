import { describe, expect, it, vi } from "vitest";
import { type HotkeyConfig, loadHotkeys } from "../settings.js";

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	return { ...actual, readFileSync: vi.fn(), existsSync: vi.fn() };
});

import { existsSync, readFileSync } from "node:fs";

const mockExists = vi.mocked(existsSync);
const mockRead = vi.mocked(readFileSync);

describe("loadHotkeys", () => {
	it("returns empty array when settings.yaml does not exist", () => {
		mockExists.mockReturnValue(false);
		const { hotkeys, warnings } = loadHotkeys("/base");
		expect(hotkeys).toEqual([]);
		expect(warnings).toEqual([]);
	});

	it("parses valid hotkeys", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
hotkeys:
  p:
    type: tmux
    command: cs h
    description: Open Claude
  o:
    type: exec
    command: "code {{tab_file_path}}"
    description: Open in VS Code
`);
		const { hotkeys } = loadHotkeys("/base");
		expect(hotkeys).toEqual([
			{ key: "p", type: "tmux", command: "cs h", description: "Open Claude" },
			{
				key: "o",
				type: "exec",
				command: "code {{tab_file_path}}",
				description: "Open in VS Code",
			},
		]);
	});

	it("skips hotkeys that collide with built-in keys and returns warnings", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
hotkeys:
  r:
    type: exec
    command: echo hi
    description: Collides with run
  p:
    type: tmux
    command: cs h
    description: Valid
`);
		const { hotkeys, warnings } = loadHotkeys("/base");
		expect(hotkeys).toHaveLength(1);
		expect(hotkeys[0].key).toBe("p");
		expect(warnings).toHaveLength(1);
		expect(warnings[0]).toContain("r");
	});

	it("skips entries with missing required fields", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
hotkeys:
  p:
    type: tmux
  o:
    type: exec
    command: code
    description: Valid
`);
		const { hotkeys, warnings } = loadHotkeys("/base");
		expect(hotkeys).toHaveLength(1);
		expect(hotkeys[0].key).toBe("o");
		expect(warnings.length).toBeGreaterThan(0);
	});

	it("skips entries with invalid type", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
hotkeys:
  p:
    type: invalid
    command: foo
    description: Bad type
`);
		const { hotkeys, warnings } = loadHotkeys("/base");
		expect(hotkeys).toEqual([]);
		expect(warnings).toHaveLength(1);
	});

	it("returns empty array when yaml has no hotkeys section", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`something_else: true`);
		const { hotkeys } = loadHotkeys("/base");
		expect(hotkeys).toEqual([]);
	});
});
