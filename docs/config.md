# Configuration Reference

## Workspace Structure

```
workspace/
├── vars.yaml              # Global template variables
├── settings.yaml          # Hotkeys, meta key, model aliases (optional)
├── shared/                # Shared files referenced by multiple tasks
├── .bin/                  # Soft-deleted and skipped runs (auto-purged after 5 days)
├── tasks/
│   └── <task-id>/
│       ├── config.yaml    # Task definition
│       └── prompt.md      # Prompt template
└── runs/                  # Execution history (auto-generated)
    └── <task-id>/
        └── <ULID>/
```

## Task Config (`tasks/<task-id>/config.yaml`)

```yaml
# ── Task identity & scheduling ──
name: "Review Dependabot PRs"     # Display name
description: "Review Dependabot PRs"  # Optional description (used in MCP tool listing)
schedule: "*/30 * * * *"          # Cron expression
timeout: 300                      # Seconds before Claude process is killed
cron_enabled: true                # Set false to disable scheduled runs
model: "sonnet"                   # Claude model (default: "sonnet")
requires_network: true            # Skip if offline (default: false)
url_template: "{{url}}"            # Deterministic URL for dashboard (supports templates)
auto_mark: false                  # Auto-mark completed runs for review (default: false)

# ── Execution pipeline (in order) ──
# 1. Discovery — find items to process
discovery:
  command: "gh pr list --author 'dependabot[bot]' --json url,number,title"
  item_key: "url"                 # Field that uniquely identifies each item

# 2. Dedup — skip items already processed
bypass_dedup: false               # When true, dedup is bypassed — discovery is the sole filter
parallel: false                   # When true, run discovered items concurrently
parallel_group_by: "pr_number"     # Group items by field for parallel execution

# 3. Pre-run hook — environment setup (per item, after dedup)
pre_run: "wt switch {{headRefName}} --no-cd --yes -C {{platform_repo_path}}"

# 4. Claude execution
cwd: "{{worktree_path}}"          # Working directory for Claude (supports templates)

# 5. Post-run hook — runs after each Claude invocation (per item, always runs)
post_run: "echo 'Run complete'"   # Optional: notifications, logging, etc.

# 6. Run cleanup — move old runs to .bin when condition matches, then teardown
cleanup:
  check: "gh pr view {{url}} --json state -q '.state'"
  when: "MERGED|CLOSED"           # Regex matched against check output
  retain: "12h"                   # Keep runs for this long before cleanup
  teardown: "wt remove {{headRefName}} --yes -C {{platform_repo_path}}"  # Runs on move to .bin

# ── Variables ──
vars:
  repo: "my-org/my-repo"
  review_style: "thorough"
```

### Field Details

**`description`** — Optional human-readable description of what the task does. Used as the tool description when exposed via MCP server.

**`cron_enabled`** — Whether the task runs on its cron schedule. `false` disables scheduled runs but the task can still be invoked manually or via MCP. For backward compatibility, `enabled` is also accepted (but `cron_enabled` takes precedence when both are present).

**`requires_network`** — When `true`, the task is skipped if the machine is offline. Defaults to `false`.

**`auto_mark`** — When `true`, completed runs are automatically marked for review in the dashboard. Defaults to `false`.

**`discovery.command`** — A shell command that must return a JSON array of objects. Each object becomes an item to process. Template variables (global + task vars) are substituted before execution. Timeout: 30 seconds.

**`discovery.item_key`** — The field in each discovered item used for deduplication. Items with a key already seen in completed/processing runs are skipped. Error runs are retried.

**`bypass_dedup`** — When `true`, deduplication is completely bypassed. Every item returned by discovery is processed regardless of previous runs. Use this for tasks where the discovery command itself filters to only items that currently need work (e.g., PRs with failing CI — discovery only returns PRs that are currently broken).

**`parallel`** — When `true`, discovered items are processed concurrently via `Promise.all`. Requires each item to have its own isolated environment (e.g., separate git worktrees via `pre_run`). Defaults to `false` (sequential).

**`parallel_group_by`** — When `parallel: true`, items are grouped by this field. Items within the same group run sequentially; different groups run in parallel. Defaults to `discovery.item_key` (every item is its own group = fully parallel). Use for tasks where items sharing a resource must not run concurrently (e.g., PR comments grouped by PR number).

**`url_template`** — Template string for the run's dashboard URL. Rendered with global + task + item variables. Takes priority over URL parsing from Claude output. Use for deterministic URLs (e.g., `https://github.com/{{platform_repo}}/pull/{{pr_number}}`).

**`pre_run`** — Shell command executed before each Claude invocation, after dedup. Runs synchronously with a 60-second timeout. Has access to all template variables (global + task + item). If it fails, the run is marked as error and `post_run` still executes. Use for environment setup (e.g., creating git worktrees).

**`cwd`** — Working directory for the Claude process. Supports template variables, so it can be set per-item (e.g., `{{worktree_path}}`). When set, Claude runs inside this directory and can read/edit files, run commands, and pick up `CLAUDE.md` project instructions.

**`post_run`** — Shell command executed after each Claude invocation. Always runs regardless of success, error, or timeout (like a `finally` block). Has access to all template variables. Failures are logged but don't affect run status. Use for post-run actions like notifications — not for resource cleanup (use `cleanup.teardown` instead).

**`cleanup`** — At the end of each task run, all completed/error/canceled runs are checked:
- **`cleanup.check`** — Shell command executed per run. Its output is matched against `cleanup.when` regex. Template variables available: global, task, and item vars (from `vars.json`). Timeout: 15 seconds. For backwards compatibility, `command` is accepted if `check` is not present.
- **`cleanup.when`** — Regex pattern. If the check output matches, the run is eligible for cleanup.
- **`cleanup.retain`** — Duration to wait after eligibility before archiving (e.g., `"12h"`, `"7d"`, `"30m"`).
- **`cleanup.teardown`** (optional) — Shell command executed once when the run is moved to `.bin/`. Use for resource cleanup like removing git worktrees and local branches. Timeout: 60 seconds. If teardown fails, the run is still archived.

This keeps the `runs/` folder clean by removing runs for items that are no longer relevant (e.g., merged PRs), while keeping worktrees alive until the run is actually archived.

## Settings (`settings.yaml`)

Optional workspace-level settings. All sections are independent — omit any you don't use.

```yaml
meta_key: s                         # Single letter a-z; pressed as Ctrl+<letter> to enter hotkey mode in watch UI

hotkeys:                            # Custom hotkeys in watch UI (see commands.md)
  e:
    command: "code {{tab_file_path}}"
    description: "Open in VS Code"

models:                             # Alias map: shortcut → exact Claude model id
  opus: claude-opus-4-6
  sonnet: claude-sonnet-4-6
  haiku: claude-haiku-4-5
```

**`models`** — Maps short aliases (the values typically written in `tasks/*/config.yaml`'s `model:` field) to exact Claude model ids. When `agent247 run` launches Claude, it resolves the task's `model:` through this map; unmapped values pass through unchanged. The same resolved id is also exposed to watch-UI hotkeys via the `{{model}}` template variable, so `claude --resume {{session_id}} --model {{model}}` pins a resumed session to the same model. Invalid entries (non-string or empty-string values) are skipped with a warning.

## Global Variables (`vars.yaml`)

Key-value pairs available to all task prompts and discovery commands via `{{variable_name}}` syntax.

```yaml
github_username: noootown
platform_repo: my-org/platform
bot_name: Review Bot
```

## Template Variables

Prompts and discovery commands use `{{variable_name}}` substitution. Variables are merged with this precedence (highest first):

1. **Reserved variables** — injected by agent247, cannot be overridden (see below)
2. **Item variables** — fields from the discovery output JSON
3. **Task variables** — from `config.yaml` `vars:`
4. **Global variables** — from `vars.yaml`

Unresolved `{{placeholders}}` are left as-is.

### Inject Files (`tasks/<task-id>/inject/`)

Each task can have an optional `inject/` folder. Any `.md` file inside is automatically injected as a template variable named after the file (without the `.md` extension). These files are gitignored and not version controlled — use them for local context that changes frequently.

| File | Variable |
|------|----------|
| `inject/notes.md` | `{{notes}}` |
| `inject/checklist.md` | `{{checklist}}` |
| `inject/context.md` | `{{context}}` |

Inject variables take highest priority — they override global, task, and item variables of the same name. The `prompt.md` decides how to use them.

Example:
```
Additional context: {{notes}}
```
