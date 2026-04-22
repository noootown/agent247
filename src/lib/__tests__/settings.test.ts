import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSettings, resolveModel } from "../settings.js";

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	return { ...actual, readFileSync: vi.fn(), existsSync: vi.fn() };
});

import { existsSync, readFileSync } from "node:fs";

const mockExists = vi.mocked(existsSync);
const mockRead = vi.mocked(readFileSync);

describe("loadSettings", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("returns defaults when settings.yaml does not exist", () => {
		mockExists.mockReturnValue(false);
		const { hotkeys, warnings, metaKey, metaKeyLabel, modelAliases } =
			loadSettings("/base");
		expect(hotkeys).toEqual([]);
		expect(warnings).toEqual([]);
		expect(metaKey).toBeNull();
		expect(metaKeyLabel).toBe("");
		expect(modelAliases).toEqual({});
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
		const { hotkeys } = loadSettings("/base");
		expect(hotkeys).toEqual([
			{ key: "p", command: "cs h", description: "Open Claude" },
			{
				key: "o",
				command: "code {{tab_file_path}}",
				description: "Open in VS Code",
			},
		]);
	});

	it("skips entries with missing command", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
hotkeys:
  p:
    command: ""
  o:
    command: code
    description: Valid
`);
		const { hotkeys, warnings } = loadSettings("/base");
		expect(hotkeys).toHaveLength(1);
		expect(hotkeys[0].key).toBe("o");
		expect(warnings.length).toBeGreaterThan(0);
	});

	it("skips entries with missing description", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
hotkeys:
  p:
    command: cs h
`);
		const { hotkeys, warnings } = loadSettings("/base");
		expect(hotkeys).toEqual([]);
		expect(warnings).toHaveLength(1);
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
		const { hotkeys, warnings } = loadSettings("/base");
		expect(hotkeys).toHaveLength(2);
		expect(warnings).toHaveLength(0);
	});

	it("returns empty hotkeys when yaml has no hotkeys section", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`something_else: true`);
		const { hotkeys } = loadSettings("/base");
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
		const { metaKey, metaKeyLabel } = loadSettings("/base");
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
		const { metaKey, metaKeyLabel } = loadSettings("/base");
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
		const { metaKey, metaKeyLabel } = loadSettings("/base");
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
		const { metaKey, metaKeyLabel, warnings } = loadSettings("/base");
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
		const { hotkeys, metaKey, warnings } = loadSettings("/base");
		expect(hotkeys).toHaveLength(1);
		expect(metaKey).toBeNull();
		expect(warnings).toHaveLength(0);
	});

	it("parses models section into modelAliases", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
models:
  opus: claude-opus-4-6
  sonnet: claude-sonnet-4-6
  haiku: claude-haiku-4-5
`);
		const { modelAliases, warnings } = loadSettings("/base");
		expect(modelAliases).toEqual({
			opus: "claude-opus-4-6",
			sonnet: "claude-sonnet-4-6",
			haiku: "claude-haiku-4-5",
		});
		expect(warnings).toEqual([]);
	});

	it("accepts partial models section", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
models:
  opus: claude-opus-4-6
`);
		const { modelAliases } = loadSettings("/base");
		expect(modelAliases).toEqual({ opus: "claude-opus-4-6" });
	});

	it("warns and skips invalid models entries (non-string value)", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
models:
  opus: 123
  sonnet: claude-sonnet-4-6
`);
		const { modelAliases, warnings } = loadSettings("/base");
		expect(modelAliases).toEqual({ sonnet: "claude-sonnet-4-6" });
		expect(warnings).toContainEqual(expect.stringContaining("opus"));
	});

	it("warns and skips empty-string model values", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
models:
  opus: ""
  sonnet: claude-sonnet-4-6
`);
		const { modelAliases, warnings } = loadSettings("/base");
		expect(modelAliases).toEqual({ sonnet: "claude-sonnet-4-6" });
		expect(warnings).toContainEqual(expect.stringContaining("opus"));
	});

	it("warns and skips null model values", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
models:
  opus:
  sonnet: claude-sonnet-4-6
`);
		const { modelAliases, warnings } = loadSettings("/base");
		expect(modelAliases).toEqual({ sonnet: "claude-sonnet-4-6" });
		expect(warnings).toContainEqual(expect.stringContaining("opus"));
	});

	it("ignores non-object models section without crashing", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`models: "not a map"`);
		const { modelAliases, warnings } = loadSettings("/base");
		expect(modelAliases).toEqual({});
		expect(warnings).toContainEqual(expect.stringContaining("models"));
	});

	it("coexists with hotkeys and meta_key sections", () => {
		mockExists.mockReturnValue(true);
		mockRead.mockReturnValue(`
meta_key: s
hotkeys:
  p:
    command: cs h
    description: Open Claude
models:
  opus: claude-opus-4-6
`);
		const { hotkeys, metaKey, modelAliases, warnings } = loadSettings("/base");
		expect(hotkeys).toHaveLength(1);
		expect(metaKey).toBe("\x13"); // ctrl+s
		expect(modelAliases).toEqual({ opus: "claude-opus-4-6" });
		expect(warnings).toEqual([]);
	});
});

describe("resolveModel", () => {
	it("returns mapped value when alias is present", () => {
		expect(resolveModel("opus", { opus: "claude-opus-4-6" })).toBe(
			"claude-opus-4-6",
		);
	});

	it("returns input unchanged when alias is missing", () => {
		expect(resolveModel("opus", { sonnet: "claude-sonnet-4-6" })).toBe("opus");
	});

	it("returns input unchanged when map is empty", () => {
		expect(resolveModel("sonnet", {})).toBe("sonnet");
	});

	it("passes through full model ids that happen to not be aliases", () => {
		expect(resolveModel("claude-opus-4-7", { opus: "claude-opus-4-6" })).toBe(
			"claude-opus-4-7",
		);
	});

	it("returns empty string unchanged when input is empty string", () => {
		expect(resolveModel("", { opus: "claude-opus-4-6" })).toBe("");
	});
});
