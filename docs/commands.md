# CLI Commands

All commands accept a `--dir <path>` flag to specify the workspace directory. Without it, agent247 resolves the workspace in this order:

1. `--dir` flag
2. `AGENT247_BASE_DIR` environment variable
3. `~/.agent247rc` file (contains the workspace path)
4. Parent of the binary location (development fallback)

## `agent247 init <path>`

Create a new workspace at the given path. Generates the directory structure with `tasks/`, `runs/`, and template files (`vars.yaml`, `.env.local`, `dev.env`).

## `agent247 run <task-id>`

Execute a single task. This is the core command — it runs the full pipeline:

1. Acquire lock (skip if task already running)
2. Auto-resolve completed runs (if lifecycle configured)
3. Run discovery command to find items
4. Deduplicate against previous runs
5. Render prompt template and invoke Claude for each item (or batch)
6. Persist results to `runs/`
7. Release lock

## `agent247 list`

List all defined tasks with their schedule, enabled status, and last run time.

```
NAME                SCHEDULE        ENABLED   LAST RUN
review-dependabot   */30 * * * *    true      2024-03-15T10:30:00Z
```

## `agent247 sync`

Write enabled task schedules into the system crontab. Entries are fenced between `# --- agent247 START ---` and `# --- agent247 END ---` markers so existing crontab entries are preserved.

## `agent247 status`

Show unreviewed runs.

| Option | Description |
|--------|-------------|
| `--all` | Include skipped and no-action runs |
| `--task <id>` | Filter by task ID |

## `agent247 show <ulid>`

Display metadata and the full report for a specific run.

## `agent247 review <ulid>`

Mark a run as reviewed (sets `reviewed: true` in `meta.yaml`).

## `agent247 clean`

Delete old run directories.

| Option | Description |
|--------|-------------|
| `--older-than <duration>` | **(required)** Duration like `7d`, `24h`, `30m` |
| `--status <status>` | Only clean runs with this status |
| `--include-unreviewed` | Also delete unreviewed runs (default: only reviewed) |

## `agent247 watch`

Auto-refreshing dashboard that shows unreviewed runs. Refreshes every 5 seconds. Exit with `Ctrl+C`.
