# Architecture

## Overview

agent247 is a local CLI tool that runs Claude-powered tasks on a schedule via macOS launchd. It discovers items via shell commands, runs Claude against each item, and persists structured results for review.

```
┌─────────┐     ┌───────────┐     ┌───────┐     ┌────────┐     ┌─────────┐
│ launchd  │────>│ Discovery │────>│ Dedup │────>│ Claude │────>│ Persist │
└─────────┘     └───────────┘     └───────┘     └────────┘     └─────────┘
                                                                     │
                                                                     v
                                                              ┌─────────────┐
                                                              │   Cleanup   │
                                                              └─────────────┘
```

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
- **Bypass** dedup entirely when `allow_rerun: true` (discovery is the sole filter)

### 4. Prompt Rendering
The prompt template (`prompt.md`) is rendered with merged variables (global < task < item). In batch mode, `{{items_json}}` and `{{items_list}}` are injected instead.

### 5. Claude Execution
Claude CLI is invoked: `claude -p <prompt> --output-format json --model <model>`. The process has a configurable timeout. Output is parsed for:
- A URL on the first line — stored as the run's URL
- The remaining text — stored as the markdown report

### 6. Run Persistence
Each execution creates a ULID-named directory under `runs/<task-id>/`:

```
runs/<task-id>/<ulid>/
├── meta.yaml            # Status, timestamps, item key, etc.
├── log.txt              # Timestamped execution log
├── prompt.rendered.md   # Final prompt sent to Claude
├── raw.json             # Raw Claude JSON output
└── report.md            # Parsed markdown report
```

Skipped runs (no new items) are written to `.bin/<task-id>/` instead, keeping `runs/` clean.

### 7. Cleanup
After processing (always runs, even when skipped), if the task has `cleanup` configured, the system checks all completed/error/canceled runs. For each, it runs `cleanup.command` with the item's context and matches against `cleanup.when`. Matching runs are moved to `.bin/`.

### 8. Lock Release

## Run Statuses

| Status | Meaning | Dedup behavior |
|--------|---------|----------------|
| `completed` | Bot finished successfully | Skip (unless `allow_rerun: true`) |
| `error` | Process failed or timed out | Retry |
| `processing` | Currently running | Skip |
| `canceled` | Manually stopped | Eligible for cleanup |
| `skipped` | No new items to process | Written to `.bin/`, not `runs/` |

## Cleanup

When a task has `cleanup` configured, at the end of each run the system checks all completed/error/canceled runs for that task. For each, it executes the `cleanup.command` (with the run's URL and item_key as template variables) and matches the output against the `cleanup.when` regex. Matching runs are moved to `.bin/`, where they are auto-purged after 5 days.

This is used to clean up runs for merged/closed PRs:
```yaml
cleanup:
  command: gh pr view {{url}} --json state -q '.state'
  when: MERGED|CLOSED
```

## launchd Integration

`agent247 sync` writes plist files to `~/Library/LaunchAgents/` for each enabled task. Each task gets a `com.agent247.<task-id>.plist` with:
- `ProgramArguments`: full path to node + CLI + `--dir` + workspace
- `StartCalendarInterval`: cron schedule converted to launchd format
- `EnvironmentVariables`: HOME, USER, PATH (for Claude CLI and Keychain access)
- `StandardOutPath`/`StandardErrorPath`: `~/Library/Logs/agent247/agent247.log`

Old agents are automatically unloaded and removed when tasks are disabled or deleted.

## Module Map

```
src/
├── cli.ts              # Commander setup, base dir resolution
├── commands/
│   ├── run.ts          # Core execution pipeline
│   ├── sync.ts         # launchd sync
│   ├── init.ts         # Workspace scaffolding
│   ├── purge.ts        # Run cleanup by age
│   └── watch/          # Interactive TUI dashboard
│       ├── index.ts    # Entry point — wires state, input, render loop
│       ├── state.ts    # State types, WatchContext, initialState()
│       ├── data.ts     # loadData(), getVisibleLines()
│       ├── actions.ts  # Shared key handlers (delete, open URL, run, stop, toggle)
│       ├── modes/      # Per-mode key handlers (split, confirm, help)
│       └── render/     # Display (split, help, confirm, ANSI utilities)
└── lib/
    ├── config.ts       # YAML config loading
    ├── discovery.ts    # Shell command → JSON items
    ├── dedup.ts        # Filter already-processed items
    ├── runner.ts       # Claude CLI invocation + output parsing
    ├── report.ts       # Run persistence (read/write/list)
    ├── launchd.ts      # macOS launchd plist management
    ├── lock.ts         # PID-based locking
    ├── logger.ts       # File + in-memory logger
    ├── template.ts     # {{variable}} substitution
    ├── bin.ts          # .bin purge (auto-delete after 5 days)
    └── crontab.ts      # Legacy crontab migration
```
