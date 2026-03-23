# Resolved Config Tab

## Goal

Write the task's `config.yaml` with `{{}}` template vars resolved to actual values, save it per run, and display it as a new tab in the TUI watch view.

## Motivation

When debugging task runs, it's useful to see exactly what config was used — with secrets and env vars filled in — without having to mentally resolve template variables.

## Design

### 1. Write resolved config per run

In `src/commands/run.ts`, after merging all vars (global + task + item), read the raw `tasks/{taskId}/config.yaml` file, apply `render()` to substitute `{{}}` template vars, and write the result as `config.resolved.yaml` to the run directory.

This happens in the same place where `vars.json` is written, using the same merged vars that are already available.

### 2. New tab: config (position 6 of 8)

Update `RUN_TABS` in `src/commands/watch/state.ts`:

```typescript
export const RUN_TABS = [
  "report.md",           // 1
  "transcript.md",       // 2
  "prompt.rendered.md",  // 3
  "meta.yaml",           // 4
  "log.txt",             // 5
  "config.resolved.yaml",// 6 (NEW)
  "vars.json",           // 7
  "response.json",       // 8
] as const;
```

### 3. Tab bar and key bindings

- `TAB_LABELS` in `split.ts` gains `"config"` at index 5.
- Number key bindings in `modes/split.ts` extend from 1-7 to 1-8.

### 4. Prettifier

Add `"config.resolved.yaml"` to the prettifiers map, using highlight.js with `yaml` language — same pattern as `jsonPrettifier` but for YAML syntax.

## Security

The resolved config may contain secrets (e.g., API keys from `{{API_KEY}}`). This is acceptable because:
- It lives in the same run directory as `vars.json` and other potentially sensitive data
- No new security surface is introduced

## Files changed

| File | Change |
|------|--------|
| `src/commands/run.ts` | Read raw config.yaml, render vars, write `config.resolved.yaml` |
| `src/commands/watch/state.ts` | Add `"config.resolved.yaml"` to `RUN_TABS` at index 5 |
| `src/commands/watch/render/split.ts` | Add `"config"` to `TAB_LABELS` |
| `src/commands/watch/render/prettifiers.ts` | Add YAML prettifier for `config.resolved.yaml` |
| `src/commands/watch/modes/split.ts` | Extend number keys 1-7 → 1-8 |
