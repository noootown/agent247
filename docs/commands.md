# CLI Commands

All commands accept a `--dir <path>` flag to specify the workspace directory. Without it, agent247 resolves the workspace in this order:

1. `--dir` flag
2. `AGENT247_BASE_DIR` environment variable
3. `~/.agent247rc` file (contains the workspace path)
4. Parent of the binary location (development fallback)

## `agent247 init <path>`

Create a new workspace at the given path. Generates the directory structure with `tasks/`, `runs/`, and a `vars.yaml` template.

## `agent247 run <task-id>`

Execute a single task. This is the core command — it runs the full pipeline:

1. Acquire lock (skip if task already running)
2. Run discovery command to find items
3. Deduplicate against previous runs
4. Render prompt template and invoke Claude for each item (or batch)
5. Persist results to `runs/<task-id>/`
6. Run cleanup — move completed/error/canceled runs to `.bin/` when cleanup condition matches
7. Release lock

Skipped runs (no new items) are written to `.bin/<task-id>/` instead of `runs/`.

## `agent247 sync`

Sync enabled task schedules to macOS launchd. Writes plist files to `~/Library/LaunchAgents/` and loads them via `launchctl`. Stale agents (disabled/deleted tasks) are automatically removed. Also removes any legacy crontab entries from a previous installation.

## `agent247 purge <duration>`

Delete runs older than the given duration. Format: `7d`, `24h`, `30m`. Also purges `.bin/` entries older than 5 days.

## `agent247 watch`

Interactive terminal dashboard (split view). Left pane shows tasks and runs, right pane shows task config info or run reports depending on selection.

### Keybindings

**Navigation:**
- `↑`/`↓` — Move selection
- `←`/`→` — Collapse/expand task group
- `Enter` — Toggle group expansion
- `w`/`a`/`s`/`d` — Scroll detail pane

**Actions:**
- `r` — Run selected task (with confirmation)
- `x` — Stop task (on group) / delete run (on run)
- `t` — Toggle task enabled/disabled (syncs to launchd)
- `u` — Open run URL in browser

**General:**
- `?` — Help
- `q`/`Esc` — Quit
