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
2. Process lifecycle (resolve pending/error, invalidate reverted items)
3. Run discovery command to find items
4. Deduplicate against previous runs
5. Render prompt template and invoke Claude for each item (or batch)
6. Persist results to `runs/<task-id>/`
7. Release lock

## `agent247 sync`

Write enabled task schedules into the system crontab. Entries are fenced between `# --- agent247 START ---` and `# --- agent247 END ---` markers so existing crontab entries are preserved.

## `agent247 clean <duration>`

Delete runs older than the given duration. Format: `7d`, `24h`, `30m`.

## `agent247 watch`

Interactive terminal dashboard for browsing runs. Supports keyboard navigation, expanding task groups, viewing run details, and resolving pending runs.
