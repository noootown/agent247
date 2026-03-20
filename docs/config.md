# Configuration Reference

## Workspace Structure

```
workspace/
├── vars.yaml              # Global template variables
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
schedule: "*/30 * * * *"          # Cron expression
timeout: 300                      # Seconds before Claude process is killed
enabled: true                     # Set false to skip in sync/run
model: "sonnet"                   # Claude model (default: "sonnet")
prompt_mode: "per_item"           # "per_item" (default) or "batch"

# ── Execution pipeline (in order) ──
# 1. Discovery — find items to process
discovery:
  command: "gh pr list --author 'dependabot[bot]' --json url,number,title"
  item_key: "url"                 # Field that uniquely identifies each item

bypass_dedup: false                # When true, dedup is bypassed — discovery is the sole filter

# 2. Pre-run hook — environment setup (per item, after dedup)
pre_run: "wt switch {{headRefName}} --no-cd --yes -C {{platform_repo_path}}"

# 3. Claude execution
cwd: "{{worktree_path}}"          # Working directory for Claude (supports templates)
parallel: false                   # When true, run discovered items concurrently

# 4. Post-run hook — cleanup (per item, always runs)
post_run: "wt remove {{headRefName}} --yes -C {{platform_repo_path}}"

# 5. Run cleanup — move old runs to .bin when condition matches
cleanup:
  command: "gh pr view {{url}} --json state -q '.state'"
  when: "MERGED|CLOSED"           # Regex matched against command output
  retain: "12h"                   # Keep runs for this long before cleanup

# ── Variables ──
vars:
  repo: "my-org/my-repo"
  review_style: "thorough"
```

### Field Details

**`discovery.command`** — A shell command that must return a JSON array of objects. Each object becomes an item to process. Template variables (global + task vars) are substituted before execution. Timeout: 30 seconds.

**`discovery.item_key`** — The field in each discovered item used for deduplication. Items with a key already seen in completed/processing runs are skipped. Error runs are retried.

**`cwd`** — Optional working directory for the Claude process. Supports template variables, so it can be set per-item (e.g., `{{worktree_path}}`). When set, Claude runs inside this directory and can read/edit files, run commands, and pick up `CLAUDE.md` project instructions.

**`prompt_mode`** — Controls how Claude is invoked:
- `per_item`: Claude is called once per discovered item. The item's fields are available as template variables.
- `batch`: Claude is called once with all items. Use `{{items_json}}` (JSON array) or `{{items_list}}` (bullet list) in your prompt.

**`pre_run`** — Shell command executed before each Claude invocation, after dedup. Runs synchronously with a 60-second timeout. Has access to all template variables (global + task + item). If it fails, the run is marked as error and `post_run` still executes. Use for environment setup (e.g., creating git worktrees).

**`post_run`** — Shell command executed after each Claude invocation. Always runs regardless of success, error, or timeout (like a `finally` block). Has access to all template variables. Failures are logged but don't affect run status. Use for cleanup (e.g., removing git worktrees).

**`bypass_dedup`** — When `true`, deduplication is completely bypassed. Every item returned by discovery is processed regardless of previous runs. Use this for tasks where the discovery command itself filters to only items that currently need work (e.g., PRs with failing CI — discovery only returns PRs that are currently broken).

**`cleanup`** — At the end of each task run, all completed/error/canceled runs are checked. For each, `cleanup.command` is executed with the run's `{{url}}` and `{{item_key}}` as template variables. If the output matches the `cleanup.when` regex, the run is moved to `.bin/` (auto-purged after 5 days). This keeps the `runs/` folder clean by removing runs for items that are no longer relevant (e.g., merged PRs).

## Global Variables (`vars.yaml`)

Key-value pairs available to all task prompts and discovery commands via `{{variable_name}}` syntax.

```yaml
github_username: noootown
platform_repo: my-org/platform
bot_name: Review Bot
```

## Template Variables

Prompts and discovery commands use `{{variable_name}}` substitution. Variables are merged with this precedence (highest first):

1. **Item variables** — fields from the discovery output JSON
2. **Task variables** — from `config.yaml` `vars:`
3. **Global variables** — from `vars.yaml`

Unresolved `{{placeholders}}` are left as-is.
