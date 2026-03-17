# Architecture

## Overview

agent247 is a local CLI tool that runs Claude-powered tasks on a cron schedule. It discovers items via shell commands, runs Claude against each item, and persists structured results for review.

```
┌─────────┐     ┌───────────┐     ┌───────┐     ┌────────┐     ┌─────────┐
│ Crontab │────>│ Discovery │────>│ Dedup │────>│ Claude │────>│ Persist │
└─────────┘     └───────────┘     └───────┘     └────────┘     └─────────┘
                                                                     │
                                                                     v
                                                              ┌─────────────┐
                                                              │ Review/Watch│
                                                              └─────────────┘
```

## Execution Flow

When `agent247 run <task-id>` is invoked (manually or via cron):

### 1. Lock Acquisition
A PID-based lock file (`tasks/<task-id>/.lock`) prevents concurrent execution of the same task. If a lock exists and the process is alive, the run is skipped. Stale locks (dead PID) are cleaned automatically.

### 2. Lifecycle Resolution
If the task has `lifecycle` configured, the system checks all existing completed/error runs for this task. For each, it runs `resolve_command` with the item's context and matches against `resolve_when`. Matching runs transition to "resolved" status.

### 3. Discovery
The `discovery.command` is executed as a shell command (with template variables substituted). It must return a JSON array of objects. Each object represents an item to process.

### 4. Deduplication
Discovered items are filtered against previous runs using `discovery.item_key`:
- **Skip** items already in completed or no-action runs
- **Retry** items from error runs
- **Allow** resolved items to be re-processed

### 5. Prompt Rendering
The prompt template (`prompt.md`) is rendered with merged variables (global < task < item). In batch mode, `{{items_json}}` and `{{items_list}}` are injected instead.

### 6. Claude Execution
Claude CLI is invoked: `claude -p <prompt> --output-format json --model <model>`. The process has a configurable timeout. Output is parsed for:
- `NO_ACTION` — marks the run as "no-action"
- A URL on the first line — stored as the run's URL
- The remaining text — stored as the markdown report

### 7. Run Persistence
Each execution creates a ULID-named directory under `runs/<task-id>/`:

```
runs/<task-id>/<ulid>/
├── meta.yaml            # Status, timestamps, item key, etc.
├── log.txt              # Timestamped execution log
├── prompt.rendered.md   # Final prompt sent to Claude
├── raw.json             # Raw Claude JSON output
└── report.md            # Parsed markdown report
```

## Run Statuses

| Status | Meaning | Dedup behavior |
|--------|---------|----------------|
| `completed` | Bot finished (acted, dismissed, or no action needed) | Skip, unless lifecycle detects external state reverted |
| `pending` | Bot unsure, needs human decision | Skip, unless lifecycle detects externally resolved |
| `error` | Process failed or timed out | Retry |
| `skipped` | No new items to process (run-level) | N/A |

Claude signals status via output: `PENDING` → pending, `NO_ACTION` → completed, anything else → completed.

Pending runs can be manually resolved to `completed` via the `watch` dashboard (`r` key).

## Lifecycle (Two-Way)

When a task has `lifecycle` configured, before each run the system performs two-way checks:

1. **completed + external state reverted** → item key is invalidated, allowing re-processing via dedup
2. **pending + external state matches** → auto-transitions to `completed`
3. **error + external state matches** → auto-transitions to `completed`

This means if a PR is reopened after being closed, or a review comment is unresolved after being resolved, the item will be re-processed on the next run.

## Crontab Integration

`agent247 sync` writes cron entries into the system crontab between fenced markers:

```
# --- agent247 START ---
# review-dependabot (Review Dependabot PRs)
*/30 * * * * /path/to/agent247 run review-dependabot >> /workspace/runs/cron.log 2>&1
# --- agent247 END ---
```

Existing crontab entries outside the fence are preserved.

## Module Map

```
src/
├── cli.ts              # Commander setup, base dir resolution
├── commands/
│   ├── run.ts          # Core execution pipeline
│   ├── sync.ts         # Crontab sync
│   ├── init.ts         # Workspace scaffolding
│   ├── clean.ts        # Run cleanup
│   └── watch.ts        # Interactive dashboard
└── lib/
    ├── config.ts       # YAML config loading
    ├── discovery.ts    # Shell command → JSON items
    ├── dedup.ts        # Filter already-processed items
    ├── runner.ts       # Claude CLI invocation + output parsing
    ├── report.ts       # Run persistence (read/write/list)
    ├── lifecycle.ts    # Auto-resolution logic
    ├── lock.ts         # PID-based locking
    ├── logger.ts       # File + in-memory logger
    ├── template.ts     # {{variable}} substitution
    └── crontab.ts      # Fenced crontab management
```
