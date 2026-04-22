# Model alias pinning in `settings.yaml`

**Date:** 2026-04-21
**Status:** Approved for implementation

## Problem

Anthropic recently released `claude-opus-4-7`. When a task's `config.yaml` specifies `model: opus`, the Claude CLI resolves the alias to whatever the latest Opus is at invocation time — currently `4-7`. After testing, the user wants to pin `opus` back to `claude-opus-4-6` without editing every task config, and wants the same mechanism available for `sonnet` and `haiku` even though only `opus` is expected to be overridden in practice.

The pin must apply in two places:

1. **Task runs** — when agent247 spawns `claude -p … --model <alias>`.
2. **Resume hotkeys** — the watch UI's custom hotkeys that spawn `claude --resume <session_id>` on an existing run. Today these pass no `--model`, so the resumed session picks its own default (the latest model). After resume, the user wants the session to continue on the pinned model.

## Non-goals

- No per-task override in `settings.yaml`. Tasks already pick their model in `config.yaml`; `settings.yaml` only remaps the alias.
- No auto-injection of `--model` into hotkey commands. Hotkey commands remain literal template strings; the new variable is opt-in.
- No migration of existing `model: opus` task configs. The alias map is the migration surface.

## Config format

Add an optional top-level `models` map to `settings.yaml`:

```yaml
models:
  opus: claude-opus-4-6
  sonnet: claude-sonnet-4-6
  haiku: claude-haiku-4-5
```

- Keys are short aliases users type in task `config.yaml` (e.g. `model: opus`).
- Values are the exact model ids passed to `claude --model`.
- Any key may be omitted; unmapped aliases pass through unchanged.
- Absence of the whole `models:` section is equivalent to an empty map.

## Module structure

The existing loader lives at `src/commands/watch/settings.ts` and is named `loadHotkeys`. Model aliases are not hotkey-specific, so:

- Move the loader to `src/lib/settings.ts` and rename to `loadSettings`.
- Return a broader `Settings` shape that includes the existing hotkey/meta-key fields plus `modelAliases: Record<string, string>`.
- The watch command imports from the new location. The old path is deleted (no re-export shim — it's only imported internally, per the codebase's no-backwards-compat stance).

Validation of the `models` section mirrors the existing `meta_key` pattern: invalid entries (non-string key, empty value, non-string value) log a warning into `warnings[]` and are skipped. The rest of the file continues to load.

## Resolution at task-run time

In `src/commands/run.ts`, around line 445 where `config.model` is passed to `executePrompt`, look up the alias and pass the resolved value:

```ts
const resolvedModel = resolveModel(config.model, settings.modelAliases);
// … executePrompt(..., resolvedModel, ...)
```

`resolveModel(alias, aliases)` is a pure helper in `src/lib/settings.ts`:

```ts
export function resolveModel(
  alias: string,
  aliases: Record<string, string>,
): string {
  return aliases[alias] ?? alias;
}
```

Settings are loaded once per `run` command invocation and passed down. No caching beyond the normal process lifetime.

## Template variable for hotkeys

In `src/commands/watch/actions.ts`, `actionCustomHotkey` builds a `vars` record that is substituted into hotkey command strings via `{{name}}`. Add `model`:

- **`line.type === "run"`:** read `data.config.model` from the run's `data.json` (same file already opened to read `session_id`), then resolve via `modelAliases`. On read error, empty string — consistent with `session_id`'s existing fallback.
- **`line.type === "group"`:** read from the task's current config model (already available on the group record) and resolve. If the group has no model, empty string.
- **Other line types:** empty string, matching `item_key` / `url` behavior.

`actionCustomHotkey` will need access to `modelAliases`. Plumb it through the `WatchContext` struct (already passed to every action) so the watch entrypoint loads settings once at startup.

The user then updates their hotkeys from:

```yaml
command: "claude --resume {{session_id}}"
```

to:

```yaml
command: "claude --resume {{session_id}} --model {{model}}"
```

## Fallback behavior

| Condition | Behavior |
|---|---|
| No `models:` section in `settings.yaml` | Empty map. Every alias passes through unchanged (today's behavior). |
| Alias present but missing from map | Pass-through unchanged. |
| Invalid entry in `models:` (non-string, empty value) | Warning logged, entry skipped, rest of file still loads. |
| Run has no model recorded | `{{model}}` is empty string. User's shell command becomes `claude --resume <id> --model ` and fails loudly. This is deliberate — preferred over silently guessing. |

## Tests

Three units of coverage. All in-process, no subprocess.

1. **`resolveModel()`** (`src/lib/__tests__/settings.test.ts`)
   - Exact match → returns mapped value.
   - Missing alias → returns input unchanged.
   - Empty map → returns input unchanged.
   - Empty string alias → returns empty string (pass-through).

2. **Settings loader** (`src/lib/__tests__/settings.test.ts`)
   - `models:` section parsed into `modelAliases`.
   - Absent `models:` → empty map, no warnings.
   - Invalid entry (e.g. `opus: 123`, `opus: ""`) → warning emitted, entry skipped, other entries and rest of settings still load.
   - Coexists with existing `meta_key`, `hotkeys`, `quiet_hours` sections (no regression).

3. **`actionCustomHotkey`** (`src/commands/watch/__tests__/actions.test.ts`)
   - `{{model}}` substituted from run's `data.config.model` and resolved via aliases.
   - `{{model}}` empty string when run's `data.json` missing or malformed.
   - `{{model}}` substituted and resolved for group lines.

No integration tests: the wiring is one extra lookup in each of two call sites, fully covered by unit tests above.

## Migration

- User updates `settings.yaml` to add the `models:` block.
- User updates their three existing hotkeys (`l`, `b`, `p`) to append `--model {{model}}` after `--resume {{session_id}}`.
- No task `config.yaml` changes required.

## Out of scope / deferred

- Documenting the new `models:` key and `{{model}}` variable in `docs/config.md`. Will be handled in the implementation plan as a separate docs task.
- Validating that the resolved model id is a known Claude model. Claude CLI already errors on unknown model ids; duplicating that check here adds no value.
