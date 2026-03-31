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
- The run URL — determined by `url_template` (if configured), falling back to the first URL found in Claude's output
- The remaining text — stored as the markdown report

When `parallel: true`, items are grouped by `parallel_group_by` (defaults to `item_key`) and groups run concurrently. Items within the same group run sequentially. Each item typically has its own worktree via `pre_run`.

### 6. Run Persistence
Each execution creates a timestamped directory under `runs/<task-id>/`:

```
runs/<task-id>/YYYYMMDD-HHMMSS±OFFSET-<ulid>/
├── data.json            # All structured data (run meta, config, vars, discovery, result)
├── log.txt              # Timestamped execution log
├── prompt.rendered.md   # Final prompt sent to Claude
├── transcript.md        # Real-time Claude event log (thinking, text, tool calls)
└── report.md            # Parsed markdown report
```

### 7. Post-run Hook (per item)
If `post_run` is configured, the shell command is executed synchronously after Claude finishes. Always runs regardless of success, error, or timeout (like a `finally` block). Used for cleanup (e.g., removing git worktrees via `wt remove`). Failures are logged but don't affect run status.

### 8. Cleanup
After all items are processed (always runs, even when skipped), if the task has `cleanup` configured, the system checks all completed/error/canceled runs. For each, it runs `cleanup.check` with the item's context and matches against `cleanup.when`. Runs older than `cleanup.retain` that match are moved to `.bin/`.

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
├── cli.ts              # Commander setup, base dir resolution, --rerun flag
├── commands/
│   ├── run.ts          # Core execution pipeline (discovery → dedup → execute)
│   ├── sync.ts         # launchd sync
│   ├── init.ts         # Workspace scaffolding
│   ├── purge.ts        # Run cleanup by age
│   └── watch/          # Interactive TUI dashboard
│       ├── index.ts    # Entry point — wires state, input, render loop
│       ├── state.ts    # State types, WatchContext, initialState()
│       ├── data.ts     # loadData(), getVisibleLines()
│       ├── actions.ts  # Key handlers (delete, open URL, run, rerun, mark, stop, toggle)
│       ├── context.ts  # Spawn run/rerun, soft delete, stop, toggle
│       ├── scroll.ts   # Scroll state management
│       ├── modes/      # Per-mode key handlers (split, confirm, help)
│       └── render/     # Display (split, list, help, confirm, ANSI utilities)
└── lib/
    ├── config.ts       # YAML config loading (TaskConfig interface)
    ├── discovery.ts    # Shell command → JSON items
    ├── dedup.ts        # Filter already-processed items
    ├── runner.ts       # Async Claude CLI invocation + stream-json parsing
    ├── report.ts       # Run persistence (read/write/list, RunMeta with marked flag)
    ├── template.ts     # {{variable}} substitution
    ├── url.ts          # URL slug formatting for dashboard display
    ├── redact.ts       # Secret redaction for logs and data
    ├── cleanup.ts      # Run cleanup logic (check + retain + teardown)
    ├── cleanup-worker.ts # Background cleanup worker
    ├── network.ts      # Network connectivity check
    ├── task-cache.ts   # Task cache (last_check timestamp)
    ├── hooks.ts        # Pre/post-run hook execution
    ├── launchd.ts      # macOS launchd plist management + schedule reading
    ├── lock.ts         # PID-based locking
    ├── logger.ts       # File + in-memory logger
    ├── bin.ts          # .bin purge (auto-delete after 5 days)
    └── constants.ts    # File name constants
```
