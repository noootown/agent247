# Architecture

## Overview

agent247 is a local CLI tool that runs Claude-powered tasks on a schedule via macOS launchd. It discovers items via shell commands, runs Claude against each item, and persists structured results for review.

**Pipeline:** launchd → Discovery → Dedup → Pre-run → Claude → Persist → Post-run → Cleanup

## Execution Flow

When `agent247 run <task-id>` is invoked (manually or via launchd):

### 1. Lock Acquisition
A PID-based lock file (`tasks/<task-id>/.lock`) prevents concurrent execution of the same task. If a lock exists and the process is alive, the run is skipped. Stale locks (dead PID) are cleaned automatically.

### 2. Discovery
The `discovery.command` is executed as a shell command (with template variables substituted). It must return a JSON array of objects. Each object represents an item to process.

### 3. Deduplication
Discovered items are filtered against previous runs using `discovery.item_key`:
- **Skip** items already in completed or processing runs
- **Retry** items from error runs
- **Bypass** dedup entirely when `bypass_dedup: true` (discovery is the sole filter)

### 4. Pre-run Hook (per item)
If `pre_run` is configured, the shell command is executed synchronously before Claude runs. Template variables (global + task + item) are available. Used for environment setup (e.g., creating git worktrees via `wt switch`). If it fails, the run is marked as error and skips to post-run.

### 5. Claude Execution
Claude CLI is invoked asynchronously via `claude -p <prompt> --output-format stream-json --verbose --model <model>`. Events stream in real-time and are written to `transcript.md` as they arrive. The process has a configurable timeout and can be cancelled mid-run.

Output is parsed for:
- A URL on the first line — stored as the run's URL
- The remaining text — stored as the markdown report

When `parallel: true`, multiple items run concurrently (each in its own worktree if pre_run creates one).

### 6. Run Persistence
Each execution creates a timestamped directory under `runs/<task-id>/`:

```
runs/<task-id>/YYYYMMDD-HHMMSS-<ulid>/
├── meta.yaml            # Status, timestamps, item key, etc.
├── log.txt              # Timestamped execution log
├── prompt.rendered.md   # Final prompt sent to Claude
├── transcript.md        # Real-time Claude event log (tool calls, reasoning)
├── raw.json             # Raw Claude JSON result
└── report.md            # Parsed markdown report
```

Skipped runs (no new items) are written to `.bin/<task-id>/` instead, keeping `runs/` clean.

### 7. Post-run Hook (per item)
If `post_run` is configured, the shell command is executed synchronously after Claude finishes. Always runs regardless of success, error, or timeout (like a `finally` block). Used for cleanup (e.g., removing git worktrees via `wt remove`). Failures are logged but don't affect run status.

### 8. Cleanup
After all items are processed (always runs, even when skipped), if the task has `cleanup` configured, the system checks all completed/error/canceled runs. For each, it runs `cleanup.command` with the item's context and matches against `cleanup.when`. Runs older than `cleanup.retain` that match are moved to `.bin/`.

### 9. Lock Release

## Run Statuses

| Status | Meaning | Dedup behavior |
|--------|---------|----------------|
| `completed` | Bot finished successfully | Skip (unless `bypass_dedup: true`) |
| `error` | Process failed or timed out | Retry |
| `processing` | Currently running | Skip |
| `canceled` | Manually stopped | Eligible for cleanup |
| `skipped` | No new items to process | Written to `.bin/`, not `runs/` |

## launchd Integration

`agent247 sync` writes plist files to `~/Library/LaunchAgents/` for each enabled task. Each task gets a `com.agent247.<task-id>.plist` with:
- `ProgramArguments`: full path to node + CLI + `--dir` + workspace
- `StartCalendarInterval`: cron schedule converted to launchd format
- `EnvironmentVariables`: HOME, USER, PATH (for Claude CLI and Keychain access)
- `StandardOutPath`/`StandardErrorPath`: `~/Library/Logs/agent247/agent247.log`

Old agents are automatically unloaded and removed when tasks are disabled or deleted. The TUI reads installed agents and their schedules directly from the plist files.

## Module Map

```
src/
├── cli.ts              # Commander setup, base dir resolution
├── commands/
│   ├── run.ts          # Core execution pipeline
│   ├── sync.ts         # launchd sync
│   ├── init.ts         # Workspace scaffolding
│   ├── purge.ts        # Run cleanup by age
│   └── watch/          # Interactive TUI dashboard (split view only)
│       ├── index.ts    # Entry point — wires state, input, render loop
│       ├── state.ts    # State types, WatchContext, initialState()
│       ├── data.ts     # loadData(), getVisibleLines()
│       ├── actions.ts  # Key handlers (delete, open URL, run, stop, toggle)
│       ├── modes/      # Per-mode key handlers (split, confirm, help)
│       └── render/     # Display (split, help, confirm, ANSI utilities)
└── lib/
    ├── config.ts       # YAML config loading (TaskConfig interface)
    ├── discovery.ts    # Shell command → JSON items
    ├── dedup.ts        # Filter already-processed items
    ├── runner.ts       # Async Claude CLI invocation + stream-json parsing
    ├── report.ts       # Run persistence (read/write/list)
    ├── launchd.ts      # macOS launchd plist management + schedule reading
    ├── lock.ts         # PID-based locking
    ├── logger.ts       # File + in-memory logger
    ├── template.ts     # {{variable}} substitution
    ├── bin.ts          # .bin purge (auto-delete after 5 days)
    └── crontab.ts      # Legacy crontab migration
```
