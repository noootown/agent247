# Model Alias Pinning Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pin short model aliases (`opus`/`sonnet`/`haiku`) to specific Claude model ids via `settings.yaml`, applied both to task runs (`claude -p … --model`) and to the watch UI's resume hotkeys (via a new `{{model}}` template variable).

**Architecture:** Promote the watch-specific hotkey loader into a shared `src/lib/settings.ts` that also parses an optional `models:` map. A pure `resolveModel(alias, aliases)` helper maps alias → model id. The `run` command resolves before spawning Claude; the watch hotkey action injects a `{{model}}` template variable resolved from the run (or task group) config.

**Tech Stack:** TypeScript, Node.js (ESM), `js-yaml`, Vitest. Existing codebase patterns (file headers, import ordering, warning-list validation) apply throughout.

**Spec:** `docs/superpowers/specs/2026-04-21-model-alias-pinning-design.md`

---

## File Structure

**Created:**
- `src/lib/settings.ts` — new home for `loadSettings()` (supersedes `loadHotkeys()`) plus `resolveModel()` and the `Settings` type.
- `src/lib/__tests__/settings.test.ts` — tests for the new loader and resolver.

**Modified:**
- `src/commands/watch/settings.ts` — deleted. All consumers re-import from `src/lib/settings.ts`.
- `src/commands/watch/__tests__/settings.test.ts` — deleted; replaced by `src/lib/__tests__/settings.test.ts`.
- `src/commands/watch/state.ts` — extend `WatchContext` with `modelAliases: Record<string, string>`; keep the existing `HotkeyConfig` import pointing at the new path.
- `src/commands/watch/index.ts` — use `loadSettings`, pass `modelAliases` into `WatchContext`.
- `src/commands/watch/actions.ts` — add `{{model}}` template variable; resolve via `ctx.modelAliases`.
- `src/commands/watch/__tests__/actions.test.ts` — add tests for `{{model}}` substitution.
- `src/commands/run.ts` — call `loadSettings(baseDir)`; resolve `config.model` via `modelAliases` before passing to `executePrompt`.

No other files change.

---

## Task 1: Extract and rename settings loader

Promote `loadHotkeys` out of the watch folder into a shared `src/lib/settings.ts`, rename it to `loadSettings`, and widen its return type to `Settings`. Pure rename/move — no behavior change yet.

**Files:**
- Create: `src/lib/settings.ts`
- Create: `src/lib/__tests__/settings.test.ts`
- Delete: `src/commands/watch/settings.ts`
- Delete: `src/commands/watch/__tests__/settings.test.ts`
- Modify: `src/commands/watch/state.ts` (import path for `HotkeyConfig`)
- Modify: `src/commands/watch/index.ts` (import path, call site)
- Modify: `src/commands/watch/actions.ts` (import path for `HotkeyConfig`)

- [ ] **Step 1.1: Create `src/lib/settings.ts` with moved code and new type name**

```ts
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface HotkeyConfig {
	key: string;
	command: string;
	description: string;
}

export interface Settings {
	hotkeys: HotkeyConfig[];
	metaKey: string | null;
	metaKeyLabel: string;
	modelAliases: Record<string, string>;
	warnings: string[];
}

export function loadSettings(baseDir: string): Settings {
	const defaults: Settings = {
		hotkeys: [],
		metaKey: null,
		metaKeyLabel: "",
		modelAliases: {},
		warnings: [],
	};

	const settingsPath = join(baseDir, "settings.yaml");
	if (!existsSync(settingsPath)) return defaults;

	const raw = yaml.load(readFileSync(settingsPath, "utf-8")) as Record<
		string,
		unknown
	>;
	if (!raw || typeof raw !== "object") return defaults;

	const warnings: string[] = [];

	let metaKey: string | null = null;
	let metaKeyLabel = "";
	if (typeof raw.meta_key === "string") {
		const letter = raw.meta_key.trim().toLowerCase();
		if (/^[a-z]$/.test(letter)) {
			metaKey = letterToCtrlByte(letter);
			metaKeyLabel = letterToCtrlLabel(letter);
		} else {
			warnings.push(
				`meta_key "${raw.meta_key}": must be a single letter (a-z), skipping`,
			);
		}
	}

	const hotkeys: HotkeyConfig[] = [];
	if (raw.hotkeys && typeof raw.hotkeys === "object") {
		const entries = raw.hotkeys as Record<string, unknown>;
		for (const [key, value] of Object.entries(entries)) {
			if (typeof value !== "object" || value === null) {
				warnings.push(`Hotkey "${key}": invalid entry, skipping`);
				continue;
			}
			const entry = value as Record<string, unknown>;

			if (typeof entry.command !== "string" || !entry.command) {
				warnings.push(`Hotkey "${key}": missing command, skipping`);
				continue;
			}

			if (typeof entry.description !== "string" || !entry.description) {
				warnings.push(`Hotkey "${key}": missing description, skipping`);
				continue;
			}

			hotkeys.push({
				key,
				command: entry.command,
				description: entry.description,
			});
		}
	}

	return {
		hotkeys,
		metaKey,
		metaKeyLabel,
		modelAliases: {},
		warnings,
	};
}

function letterToCtrlByte(letter: string): string {
	return String.fromCharCode(letter.charCodeAt(0) - 96);
}

function letterToCtrlLabel(letter: string): string {
	return `Ctrl+${letter.toUpperCase()}`;
}
```

Note: `modelAliases` is always empty in this task. Task 3 wires it.

- [ ] **Step 1.2: Create `src/lib/__tests__/settings.test.ts` mirroring the old tests plus a new-name import**

```ts
import { describe, expect, it, vi } from "vitest";
import { loadSettings } from "../settings.js";

vi.mock("node:fs", async () => {
	const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
	return { ...actual, readFileSync: vi.fn(), existsSync: vi.fn() };
});

import { existsSync, readFileSync } from "node:fs";

const mockExists = vi.mocked(existsSync);
const mockRead = vi.mocked(readFileSync);

describe("loadSettings", () => {
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
		expect(metaKey).toBe("\x01");
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
		expect(metaKey).toBe("\x02");
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
		expect(metaKey).toBe("\x01");
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
});
```

- [ ] **Step 1.3: Update imports in `src/commands/watch/state.ts`**

Change line 4 from `import type { HotkeyConfig } from "./settings.js";` to `import type { HotkeyConfig } from "../../lib/settings.js";`

- [ ] **Step 1.4: Update imports and call site in `src/commands/watch/index.ts`**

- Replace `import { loadHotkeys } from "./settings.js";` with `import { loadSettings } from "../../lib/settings.js";`
- Replace the call `const { hotkeys, metaKey, metaKeyLabel, warnings: hotkeyWarnings } = loadHotkeys(baseDir);` with `const { hotkeys, metaKey, metaKeyLabel, warnings: hotkeyWarnings } = loadSettings(baseDir);`

- [ ] **Step 1.5: Update imports in `src/commands/watch/actions.ts`**

Change line 6 from `import type { HotkeyConfig } from "./settings.js";` to `import type { HotkeyConfig } from "../../lib/settings.js";`

- [ ] **Step 1.6: Delete old files**

```bash
rm src/commands/watch/settings.ts src/commands/watch/__tests__/settings.test.ts
```

- [ ] **Step 1.7: Run tests and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: All tests pass (existing tests still green via the new file path); no type errors.

- [ ] **Step 1.8: Commit**

```bash
git add src/lib/settings.ts src/lib/__tests__/settings.test.ts src/commands/watch/state.ts src/commands/watch/index.ts src/commands/watch/actions.ts
git add -u src/commands/watch/settings.ts src/commands/watch/__tests__/settings.test.ts
git commit -m "refactor(settings): move loadHotkeys to lib/settings as loadSettings"
```

---

## Task 2: Add `resolveModel` pure function (TDD)

Add the alias-resolution helper. Pure function, easy to test first.

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/__tests__/settings.test.ts`

- [ ] **Step 2.1: Write failing tests for `resolveModel`**

Append to `src/lib/__tests__/settings.test.ts`:

```ts
import { resolveModel } from "../settings.js";

describe("resolveModel", () => {
	it("returns mapped value when alias is present", () => {
		expect(
			resolveModel("opus", { opus: "claude-opus-4-6" }),
		).toBe("claude-opus-4-6");
	});

	it("returns input unchanged when alias is missing", () => {
		expect(resolveModel("opus", { sonnet: "claude-sonnet-4-6" })).toBe("opus");
	});

	it("returns input unchanged when map is empty", () => {
		expect(resolveModel("sonnet", {})).toBe("sonnet");
	});

	it("passes through full model ids that happen to not be aliases", () => {
		expect(
			resolveModel("claude-opus-4-7", { opus: "claude-opus-4-6" }),
		).toBe("claude-opus-4-7");
	});

	it("returns empty string unchanged when input is empty string", () => {
		expect(resolveModel("", { opus: "claude-opus-4-6" })).toBe("");
	});
});
```

Also add this import at the top (merge with existing import if possible):
```ts
import { loadSettings, resolveModel } from "../settings.js";
```

- [ ] **Step 2.2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/__tests__/settings.test.ts`
Expected: FAIL with "resolveModel is not exported" / "resolveModel is not a function".

- [ ] **Step 2.3: Implement `resolveModel` in `src/lib/settings.ts`**

Add this export at the bottom of `src/lib/settings.ts` (above the private helpers):

```ts
export function resolveModel(
	alias: string,
	aliases: Record<string, string>,
): string {
	return aliases[alias] ?? alias;
}
```

- [ ] **Step 2.4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/__tests__/settings.test.ts`
Expected: PASS (all 5 new tests + all prior tests).

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/settings.ts src/lib/__tests__/settings.test.ts
git commit -m "feat(settings): add resolveModel alias helper"
```

---

## Task 3: Parse `models:` section in `loadSettings` (TDD)

Extend the loader to read `modelAliases` from the `models:` section, with validation and warnings.

**Files:**
- Modify: `src/lib/settings.ts`
- Modify: `src/lib/__tests__/settings.test.ts`

- [ ] **Step 3.1: Write failing tests for `models:` parsing**

Append to the `describe("loadSettings", …)` block in `src/lib/__tests__/settings.test.ts`:

```ts
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
		expect(metaKey).toBe("\x13");
		expect(modelAliases).toEqual({ opus: "claude-opus-4-6" });
		expect(warnings).toEqual([]);
	});
```

- [ ] **Step 3.2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/__tests__/settings.test.ts`
Expected: FAIL — the new "parses models section" tests fail because `modelAliases` is always `{}`.

- [ ] **Step 3.3: Implement `models:` parsing in `loadSettings`**

In `src/lib/settings.ts`, inside `loadSettings`, after the hotkeys parsing block and before the `return`, add:

```ts
	const modelAliases: Record<string, string> = {};
	if (raw.models !== undefined) {
		if (typeof raw.models !== "object" || raw.models === null || Array.isArray(raw.models)) {
			warnings.push(`models: must be a map, skipping`);
		} else {
			const entries = raw.models as Record<string, unknown>;
			for (const [alias, value] of Object.entries(entries)) {
				if (typeof value !== "string" || value === "") {
					warnings.push(
						`models.${alias}: must be a non-empty string, skipping`,
					);
					continue;
				}
				modelAliases[alias] = value;
			}
		}
	}
```

Then replace the `return` block to use the populated map:

```ts
	return {
		hotkeys,
		metaKey,
		metaKeyLabel,
		modelAliases,
		warnings,
	};
```

- [ ] **Step 3.4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/__tests__/settings.test.ts`
Expected: PASS (all existing + new tests).

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/settings.ts src/lib/__tests__/settings.test.ts
git commit -m "feat(settings): parse models section into modelAliases"
```

---

## Task 4: Plumb `modelAliases` through `WatchContext`

Give the watch UI's actions access to the alias map.

**Files:**
- Modify: `src/commands/watch/state.ts`
- Modify: `src/commands/watch/index.ts`

- [ ] **Step 4.1: Add `modelAliases` to `WatchContext` interface**

In `src/commands/watch/state.ts`, extend the `WatchContext` interface (around lines 74-89) by adding a new field after `metaKeyLabel`:

```ts
	modelAliases: Record<string, string>;
```

Final `WatchContext` shape:

```ts
export interface WatchContext {
	baseDir: string;
	runsDir: string;
	binDir: string;
	botName: string;
	reload: (state: State) => State;
	softDelete: (runDir: string) => void;
	stopTask: (taskId: string) => void;
	toggleTask: (taskId: string) => void;
	spawnRun: (taskId: string) => void;
	spawnRerun: (taskId: string, itemKey: string) => void;
	openUrl: (url: string) => void;
	hotkeys: HotkeyConfig[];
	metaKey: string | null;
	metaKeyLabel: string;
	modelAliases: Record<string, string>;
}
```

- [ ] **Step 4.2: Populate `modelAliases` in `src/commands/watch/index.ts`**

Update the destructure around line 34:

```ts
	const {
		hotkeys,
		metaKey,
		metaKeyLabel,
		modelAliases,
		warnings: hotkeyWarnings,
	} = loadSettings(baseDir);
```

And add to the `ctx` literal (around line 53-70):

```ts
	const ctx: WatchContext = {
		baseDir,
		runsDir,
		binDir,
		botName,
		reload: (s) => loadData(baseDir, runsDir, s),
		softDelete: makeSoftDelete(baseDir, runsDir, binDir, globalVars),
		stopTask: makeStopTask(baseDir, runsDir, globalVars),
		toggleTask: makeToggleTask(baseDir),
		spawnRun: makeSpawnRun(baseDir),
		spawnRerun: makeSpawnRerun(baseDir),
		openUrl: (url) => {
			spawn("open", [url], { stdio: "ignore" });
		},
		hotkeys,
		metaKey,
		metaKeyLabel,
		modelAliases,
	};
```

- [ ] **Step 4.3: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 4.4: Run tests**

Run: `pnpm test`
Expected: all existing tests pass (behavior unchanged; only plumbing added).

If existing `actions.test.ts` constructs a `WatchContext` literal, it will fail TypeScript compilation. If so, add `modelAliases: {}` to each literal in that file. (Step 5 adds the behavior; this step only plumbs the field.)

- [ ] **Step 4.5: Commit**

```bash
git add src/commands/watch/state.ts src/commands/watch/index.ts src/commands/watch/__tests__/actions.test.ts
git commit -m "feat(watch): expose modelAliases via WatchContext"
```

(Only add `actions.test.ts` if it was edited to unblock typecheck.)

---

## Task 5: Resolve alias in `run` command (TDD)

Wire `resolveModel` into `runCommand` so task runs spawn Claude with the pinned model id.

**Files:**
- Modify: `src/commands/run.ts`
- Modify: `src/commands/__tests__/run.test.ts` (add a unit test for model resolution)

- [ ] **Step 5.1: Inspect the existing run test file to match its patterns**

Run: `grep -n "executePrompt\|describe\|it(" src/commands/__tests__/run.test.ts | head -20`

Read the file to understand the mocking approach for `executePrompt`. We'll add a new test case near the existing ones using the same pattern. If a test for model-passing exists, modify it; otherwise add a new `it(...)` block inside the existing describe.

- [ ] **Step 5.2: Write a failing test that asserts `executePrompt` is called with the resolved model**

In `src/commands/__tests__/run.test.ts`, add an `it(...)` block that:

1. Mocks `loadSettings` (from `src/lib/settings.ts`) to return `{ hotkeys: [], metaKey: null, metaKeyLabel: "", modelAliases: { opus: "claude-opus-4-6" }, warnings: [] }`.
2. Mocks `loadTaskConfig` to return a config with `model: "opus"`.
3. Mocks `executePrompt` and asserts the `model` positional argument equals `"claude-opus-4-6"`.

Use the same mocking style already present in that file. If you need to add a `vi.mock("../../lib/settings.js", ...)` block, place it alongside the existing `vi.mock` calls at the top.

Example skeleton (adapt to the file's existing conventions):

```ts
it("resolves config.model through modelAliases before executing", async () => {
	// … configure mocks so loadSettings returns { modelAliases: { opus: "claude-opus-4-6" } }
	// … configure loadTaskConfig to return model: "opus"
	const executeMock = vi.mocked(executePrompt);
	await runCommand("my-task", "/base");
	expect(executeMock).toHaveBeenCalled();
	expect(executeMock.mock.calls[0][3]).toBe("claude-opus-4-6"); // 4th arg = model
});
```

If the existing test file has no mock for `loadSettings` yet, adjust it so the default mocked return gives `modelAliases: {}` (so existing tests continue to pass-through model unchanged).

- [ ] **Step 5.3: Run the test to verify it fails**

Run: `pnpm vitest run src/commands/__tests__/run.test.ts`
Expected: FAIL — the new assertion fails because `run.ts` still passes `config.model` (`"opus"`) verbatim.

- [ ] **Step 5.4: Wire `loadSettings` + `resolveModel` into `run.ts`**

In `src/commands/run.ts`:

Add to the imports at the top:

```ts
import { loadSettings, resolveModel } from "../lib/settings.js";
```

Inside `runCommand` (after `const config = loadTaskConfig(taskId, baseDir);` around line 136), load settings:

```ts
	const settings = loadSettings(baseDir);
	for (const warning of settings.warnings) {
		console.warn(`settings.yaml: ${warning}`);
	}
	const resolvedModel = resolveModel(config.model, settings.modelAliases);
```

Then replace the `config.model` argument in the `executePrompt` call (around line 445):

```ts
		const execResult = await executePrompt(
			renderedPrompt,
			config.timeout,
			"claude",
			resolvedModel,
			renderedCwd,
			join(runDir, FILE.TRANSCRIPT),
			(pid) => registerChildPid(config.id, baseDir, pid),
			(sessionId) => {
				try {
					const dataPath = join(runDir, FILE.DATA);
					const data = JSON.parse(readFileSync(dataPath, "utf-8"));
					if (!data.result) data.result = {};
					data.result.session_id = sessionId;
					writeFileSync(dataPath, JSON.stringify(data, null, 2));
				} catch {}
			},
		);
```

- [ ] **Step 5.5: Run the test to verify it passes**

Run: `pnpm vitest run src/commands/__tests__/run.test.ts`
Expected: PASS.

- [ ] **Step 5.6: Run full test suite and typecheck**

Run: `pnpm test && pnpm typecheck`
Expected: all green.

- [ ] **Step 5.7: Commit**

```bash
git add src/commands/run.ts src/commands/__tests__/run.test.ts
git commit -m "feat(run): resolve task model through settings.modelAliases"
```

---

## Task 6: Add `{{model}}` template variable in watch hotkeys (TDD)

Expose the resolved model id as a substitutable template variable inside custom hotkey commands.

**Files:**
- Modify: `src/commands/watch/actions.ts`
- Modify: `src/commands/watch/__tests__/actions.test.ts`

- [ ] **Step 6.1: Write failing tests for `{{model}}` substitution**

Read `src/commands/watch/__tests__/actions.test.ts` first to match its existing conventions for mocking `spawn`, building a `WatchContext`, and stubbing `data.json` reads.

Add three new tests to the `describe("actionCustomHotkey", …)` block (create it if it doesn't exist):

```ts
it("substitutes {{model}} from run data.config.model, resolving via aliases", () => {
	mockExists.mockReturnValue(true);
	mockRead.mockImplementation((path: string) => {
		if (String(path).endsWith("data.json")) {
			return JSON.stringify({
				config: { model: "opus" },
				result: { session_id: "abc" },
			});
		}
		return "";
	});

	const ctx = makeContext({ modelAliases: { opus: "claude-opus-4-6" } });
	const line = makeRunLine({ dir: "/runs/x" });
	const hotkey = {
		key: "p",
		command: "claude --resume {{session_id}} --model {{model}}",
		description: "test",
	};

	actionCustomHotkey(initialState(), line, hotkey, ctx);

	expect(spawnMock).toHaveBeenCalledWith(
		"claude --resume abc --model claude-opus-4-6",
		expect.any(Object),
	);
});

it("leaves {{model}} empty when run data.json is missing or malformed", () => {
	mockExists.mockReturnValue(true);
	mockRead.mockImplementation(() => {
		throw new Error("ENOENT");
	});

	const ctx = makeContext({ modelAliases: { opus: "claude-opus-4-6" } });
	const line = makeRunLine({ dir: "/runs/x" });
	const hotkey = {
		key: "p",
		command: "echo {{model}}",
		description: "test",
	};

	actionCustomHotkey(initialState(), line, hotkey, ctx);

	expect(spawnMock).toHaveBeenCalledWith("echo ", expect.any(Object));
});

it("substitutes {{model}} from task group config for group lines", () => {
	const ctx = makeContext({ modelAliases: { sonnet: "claude-sonnet-4-6" } });
	const line = makeGroupLine({ task: "my-task", model: "sonnet" });
	const hotkey = {
		key: "m",
		command: "echo {{model}}",
		description: "test",
	};

	actionCustomHotkey(initialState(), line, hotkey, ctx);

	expect(spawnMock).toHaveBeenCalledWith(
		"echo claude-sonnet-4-6",
		expect.any(Object),
	);
});
```

If helpers like `makeContext`, `makeRunLine`, `makeGroupLine` don't already exist in the test file, add them. A minimal shape:

```ts
function makeContext(overrides: Partial<WatchContext> = {}): WatchContext {
	return {
		baseDir: "/base",
		runsDir: "/base/runs",
		binDir: "/base/.bin",
		botName: "agent247",
		reload: (s) => s,
		softDelete: () => {},
		stopTask: () => {},
		toggleTask: () => {},
		spawnRun: () => {},
		spawnRerun: () => {},
		openUrl: () => {},
		hotkeys: [],
		metaKey: null,
		metaKeyLabel: "",
		modelAliases: {},
		...overrides,
	};
}
```

If existing tests already construct `WatchContext` differently, use their helper and just add the `modelAliases` field.

- [ ] **Step 6.2: Run tests to verify they fail**

Run: `pnpm vitest run src/commands/watch/__tests__/actions.test.ts`
Expected: FAIL — `{{model}}` passes through literally because the variable isn't populated yet.

- [ ] **Step 6.3: Populate `vars.model` in `actionCustomHotkey`**

In `src/commands/watch/actions.ts`, update `actionCustomHotkey` to add the `model` variable.

Add the import:

```ts
import { resolveModel } from "../../lib/settings.js";
```

Replace the `vars` construction block (currently lines 128-155) with:

```ts
	// Build template variables from run context
	const vars: Record<string, string> = { cwd };
	if (line.type === "run") {
		const tabName = RUN_TABS[state.activeTab] ?? FILE.REPORT;
		const tabFile = tabName.includes(".")
			? join(line.run.dir, tabName)
			: join(line.run.dir, FILE.DATA);
		vars.tab_file_path = tabFile;
		vars.run_dir = line.run.dir;
		vars.task = line.run.meta.task;
		vars.item_key = line.run.meta.item_key ?? "";
		vars.url = line.run.meta.url ?? "";

		// Extract session_id and model from data.json result/config
		try {
			const dataPath = join(line.run.dir, FILE.DATA);
			const data = JSON.parse(readFileSync(dataPath, "utf-8"));
			vars.session_id = data.result?.session_id ?? "";
			const rawModel = data.config?.model;
			vars.model =
				typeof rawModel === "string" && rawModel
					? resolveModel(rawModel, ctx.modelAliases)
					: "";
		} catch {
			vars.session_id = "";
			vars.model = "";
		}
	} else {
		vars.tab_file_path = "";
		vars.run_dir = "";
		vars.task = line.type === "group" ? line.group.task : "";
		vars.item_key = "";
		vars.url = "";
		vars.session_id = "";
		const groupModel =
			line.type === "group" ? line.group.config.model : undefined;
		vars.model =
			typeof groupModel === "string" && groupModel
				? resolveModel(groupModel, ctx.modelAliases)
				: "";
	}
```

Notes:
- `{{session_id}}` is explicitly set to `""` in the `else` branch (it was undefined before). This matches the existing behavior: undefined template vars rendered as `""` by the template replacer on line 159, so the observable behavior is identical. The explicit assignment is purely for symmetry.
- `ctx.modelAliases` is available because Task 4 added it to `WatchContext`.

- [ ] **Step 6.4: Run tests to verify they pass**

Run: `pnpm vitest run src/commands/watch/__tests__/actions.test.ts`
Expected: PASS.

- [ ] **Step 6.5: Run full test suite and typecheck**

Run: `pnpm test && pnpm typecheck && pnpm lint:ci`
Expected: all green.

- [ ] **Step 6.6: Commit**

```bash
git add src/commands/watch/actions.ts src/commands/watch/__tests__/actions.test.ts
git commit -m "feat(watch): add {{model}} template var resolved via modelAliases"
```

---

## Task 7: Smoke test end-to-end

Manually exercise both paths to confirm the settings land correctly.

**Files:** None (manual verification + user-level settings).

- [ ] **Step 7.1: Build**

Run: `pnpm build`
Expected: clean build, no type errors.

- [ ] **Step 7.2: Add a `models:` block to the live workspace settings**

Edit `~/workspace/agent247/settings.yaml` to add:

```yaml
models:
  opus: claude-opus-4-6
  sonnet: claude-sonnet-4-6
  haiku: claude-haiku-4-5
```

- [ ] **Step 7.3: Update the user's three resume hotkeys (`l`, `b`, `p`)**

In the same file, change each occurrence of `claude --resume {{session_id}}` to `claude --resume {{session_id}} --model {{model}}`.

- [ ] **Step 7.4: Smoke-test a task run**

Pick a cheap task (e.g. a no-op one from `tasks-example/`), set `model: opus` in its `config.yaml`, and run:

```bash
agent247 run <task-id>
```

Inspect the most recent run's `data.json` (or log) to confirm `--model claude-opus-4-6` appears in the spawned args. Alternatively, `ps` the child while it runs.

- [ ] **Step 7.5: Smoke-test the resume hotkey**

Launch `agent247 watch`, pick a completed run, press the meta-key then `p`. Confirm the spawned `claude` session resumes on `claude-opus-4-6`.

- [ ] **Step 7.6: Report results**

No commit for this task. If any smoke test fails, open a new debugging task rather than changing code blindly.

---

## Self-Review Notes

- **Spec coverage:**
  - Config format (spec §"Config format") → Task 3.
  - Loader move (spec §"Module structure") → Task 1.
  - `resolveModel` helper (spec §"Resolution at task-run time") → Task 2.
  - Task-run wiring (spec §"Resolution at task-run time") → Task 5.
  - `{{model}}` template variable (spec §"Template variable for hotkeys") → Tasks 4 + 6.
  - Fallback behavior (spec §"Fallback behavior") → covered by Task 2/3/6 tests.
  - Tests (spec §"Tests") → Tasks 2, 3, 5, 6.
  - Docs deferral (spec §"Out of scope") → explicitly deferred, matches spec.
- **Type consistency:** `Settings`, `modelAliases`, `resolveModel(alias, aliases)` spelled the same across all tasks. `WatchContext.modelAliases` declared in Task 4, consumed in Task 6.
- **Placeholder scan:** Code shown in every implementation step. Test skeletons for Task 5 and Task 6 reference existing file conventions with instructions to inspect first (because those test files already exist and have their own mocking style); this is a deliberate instruction, not a placeholder.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-21-model-alias-pinning.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
