# CLI Commands

All commands accept a `--dir <path>` flag to specify the workspace directory. Without it, agent247 resolves the workspace in this order:

1. `--dir` flag
2. `AGENT247_BASE_DIR` environment variable
3. `~/.agent247rc` file (contains the workspace path)
4. Parent of the binary location (development fallback)

## `agent247 init <path>`

Create a new workspace at the given path. Generates the directory structure with `tasks/`, `runs/`, `.gitignore`, and a `vars.yaml` template.

## `agent247 run <task-id> [--rerun <item-key>]`

Execute a single task. This is the core command — it runs the full pipeline:

When `--rerun <item-key>` is provided, discovery runs normally but results are filtered to only the matching item. Dedup is bypassed. If the item is no longer in discovery results, falls back to stored variables from the most recent run with that item key.

1. Acquire lock (skip if task already running)
2. Run discovery command to find items
3. Deduplicate against previous runs (skipped when `bypass_dedup: true`)
4. For each item (parallel if `parallel: true`, grouped by `parallel_group_by`):
   a. Execute `pre_run` hook (if configured)
   b. Render prompt and invoke Claude (async, streams to `transcript.md`)
   c. Persist results to `runs/<task-id>/YYYYMMDD-HHMMSS-<ulid>/`
   d. Execute `post_run` hook (if configured, always runs)
5. Run cleanup — move completed/error/canceled runs to `.bin/` when cleanup condition matches and retention period has passed
6. Release lock

Skipped runs (no new items) are written to `.bin/<task-id>/` instead of `runs/`.

## `agent247 sync`

Sync enabled task schedules to macOS launchd. Writes plist files to `~/Library/LaunchAgents/` and loads them via `launchctl`. Stale agents (disabled/deleted tasks) are automatically removed. Also removes any legacy crontab entries from a previous installation.

## `agent247 purge <duration>`

Delete runs older than the given duration. Format: `7d`, `24h`, `30m`. Also purges `.bin/` entries older than 5 days.

## `agent247 watch`

Interactive terminal dashboard (split view). Left pane shows tasks and runs, right pane shows task config info (when selecting a task) or run reports (when selecting a run).

### Keybindings

**Navigation (Task List):**
- `↑`/`↓` — Move selection
- `Shift+↑`/`Shift+↓` — Multi-select
- `←`/`→` — Collapse/expand task group
- `Enter` — Toggle group expansion
- `j` — Jump to next task group
- `z` — Toggle all groups collapsed/expanded

**Navigation (Detail Pane):**
- `w`/`a`/`s`/`d` — Scroll (up/left/down/right)
- `Home`/`End` — Scroll to top/bottom
- `1`-`6` — Switch file tab
- `Tab` — Next tab
- `Shift+Tab` — Previous tab
- `f` — Toggle full-width pane

**Actions (Task):**
- `r` — Run selected task (with confirmation)
- `x` — Stop running task
- `t` — Toggle task enabled/disabled (syncs to launchd)

**Actions (Run):**
- `r` — Rerun item (with confirmation)
- `m` — Mark/unmark for review
- `x` — Delete run
- `u` — Open run URL in browser
- `e` — Open shell at run's cwd
- `p` — Open Claude at run's cwd
- `v` — Open tmux pane right at run's cwd
- `h` — Open tmux pane below at run's cwd

**General:**
- `l` — Toggle layout (vertical/horizontal)
- `?` — Help
- `q`/`Esc` — Quit
