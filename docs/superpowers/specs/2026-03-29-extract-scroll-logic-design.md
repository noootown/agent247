# Extract Shared Scroll Logic

## Problem

Scroll key handling is duplicated across the codebase (split mode has two copies, help mode has its own). Each instance risks diverging — the help mode had an unbounded scroll bug that split mode had already fixed. Future scrollable views would face the same risk.

## Solution

Extract a pure `handleScrollKeys` function into `src/commands/watch/scroll.ts` that encapsulates key matching and clamped scroll math.

## API

```ts
// src/commands/watch/scroll.ts

export enum ScrollDirection {
  UP,
  DOWN,
  LEFT,
  RIGHT,
  HOME,
  END,
}

export function applyScroll(
  direction: ScrollDirection,
  scrollY: number,
  scrollX: number,
  maxY: number,
): { scrollY: number; scrollX: number };
```

### Direction Effects

| Direction | Effect |
|-----------|--------|
| `UP` | scrollY - 1, clamped to 0 |
| `DOWN` | scrollY + 1, clamped to maxY |
| `LEFT` | scrollX - 4, clamped to 0 |
| `RIGHT` | scrollX + 4 |
| `HOME` | scrollY = 0 |
| `END` | scrollY = maxY |

### Key-to-Direction Mapping

Each caller maps its own keys to `ScrollDirection`. The function itself has no knowledge of key bindings.

## Caller Changes

### split.ts

Both the full-pane and normal-mode scroll blocks map `w`/`s`/`a`/`d`/Home/End to `ScrollDirection` values and call `applyScroll`. The caller remains responsible for setting `followBottom: false` when `scrollY` decreases (only in normal mode, not full-pane).

### help.ts (mode handler)

Maps `↑`/`↓`/Home/End to `ScrollDirection` values and calls `applyScroll`. Passes `scrollX: 0` and ignores it. No `w`/`s`/`a`/`d` handling — help mode only responds to arrows and Home/End.

### help.ts (render)

`helpMaxScroll()` remains exported so the help mode handler can pass it as `maxY`.

## Tests

File: `src/commands/watch/__tests__/scroll.test.ts`

Test cases:
- UP decrements scrollY by 1
- UP at scrollY=0 stays at 0
- DOWN increments scrollY by 1
- DOWN at scrollY=maxY stays at maxY
- LEFT decrements scrollX by 4
- LEFT at scrollX=0 stays at 0
- RIGHT increments scrollX by 4
- HOME sets scrollY to 0
- END sets scrollY to maxY

## Out of Scope

- `followBottom` logic (stays in split.ts, caller concern)
- Tab switching in full-pane mode (unrelated to scrolling)
- Arrow key navigation in split mode task list (different purpose)
