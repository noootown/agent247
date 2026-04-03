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
	it("returns defaults when settings.yaml does not exist", () => {
		mockExists.mockReturnValue(false);
		const { hotkeys, warnings, metaKey, metaKeyLabel } = loadHotkeys("/base");
		expect(hotkeys).toEqual([]);
		expect(warnings).toEqual([]);
		expect(metaKey).toBeNull();
		expect(metaKeyLabel).toBe("");
	});

	it("parses valid hotkeys", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
meta_key: s
hotkeys:
  p:
    command: cs h
    description: Open Claude
  o:
    command: "code {{tab_file_path}}"
    description: Open in VS Code
`);
		const { hotkeys } = loadHotkeys("/base");
		expect(hotkeys).toEqual([
			{ key: "p", command: "cs h", description: "Open Claude" },
			{
				key: "o",
				command: "code {{tab_file_path}}",
				description: "Open in VS Code",
			},
		]);
	});

	it("no longer filters built-in key collisions", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
meta_key: s
hotkeys:
  r:
    command: echo hi
    description: Was colliding with run
  p:
    command: cs h
    description: Valid
`);
		const { hotkeys, warnings } = loadHotkeys("/base");
		expect(hotkeys).toHaveLength(2);
		expect(warnings).toHaveLength(0);
	});

	it("skips entries with missing required fields", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
hotkeys:
  p:
    command: ""
  o:
    command: code
    description: Valid
`);
		const { hotkeys, warnings } = loadHotkeys("/base");
		expect(hotkeys).toHaveLength(1);
		expect(hotkeys[0].key).toBe("o");
		expect(warnings.length).toBeGreaterThan(0);
	});

	it("skips entries with missing command", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
hotkeys:
  p:
    description: No command
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

	it("parses custom meta_key", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
meta_key: a
hotkeys:
  p:
    command: cs h
    description: Open Claude
`);
		const { metaKey, metaKeyLabel } = loadHotkeys("/base");
		expect(metaKey).toBe("\x01"); // ctrl+a
		expect(metaKeyLabel).toBe("Ctrl+A");
	});

	it("handles meta_key with extra whitespace", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
meta_key: " b "
hotkeys:
  p:
    command: cs h
    description: Open Claude
`);
		const { metaKey, metaKeyLabel } = loadHotkeys("/base");
		expect(metaKey).toBe("\x02"); // ctrl+b
		expect(metaKeyLabel).toBe("Ctrl+B");
	});

	it("handles meta_key case insensitively", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
meta_key: A
hotkeys:
  p:
    command: cs h
    description: Open Claude
`);
		const { metaKey, metaKeyLabel } = loadHotkeys("/base");
		expect(metaKey).toBe("\x01"); // ctrl+a
		expect(metaKeyLabel).toBe("Ctrl+A");
	});

	it("warns on invalid meta_key", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
meta_key: invalid
hotkeys:
  p:
    command: cs h
    description: Open Claude
`);
		const { metaKey, metaKeyLabel, warnings } = loadHotkeys("/base");
		expect(metaKey).toBeNull();
		expect(metaKeyLabel).toBe("");
		expect(warnings).toContainEqual(expect.stringContaining("meta_key"));
	});

	it("parses hotkeys without meta_key (hint shown in help screen)", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
hotkeys:
  p:
    command: cs h
    description: Open Claude
`);
		const { hotkeys, metaKey, warnings } = loadHotkeys("/base");
		expect(hotkeys).toHaveLength(1);
		expect(metaKey).toBeNull();
		expect(warnings).toHaveLength(0);
	});
});
