# Configuration Reference

## Workspace Structure

```
workspace/
├── vars.yaml              # Global template variables
├── .env.local             # Secrets (GITHUB_TOKEN, etc.)
├── dev.env                # Dev environment variables
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
# Required fields
name: "Review Dependabot PRs"     # Display name
schedule: "*/30 * * * *"          # Cron expression
timeout: 300                      # Seconds before Claude process is killed
enabled: true                     # Set false to skip in sync/run

# Required: how to find items to process
discovery:
  command: "gh pr list --author 'dependabot[bot]' --json url,number,title"
  item_key: "url"                 # Field that uniquely identifies each item

# Optional fields
model: "sonnet"                   # Claude model (default: "sonnet")
prompt_mode: "per_item"           # "per_item" (default) or "batch"
cwd: "{{worktree_path}}"         # Working directory for Claude (supports templates)

# Optional: task-specific template variables
vars:
  repo: "my-org/my-repo"
  review_style: "thorough"

# Optional: auto-resolve runs when external state changes
lifecycle:
  auto_resolve: true
  resolve_command: "gh pr view {{url}} --json state -q '.state'"
  resolve_when: "MERGED|CLOSED"   # Regex matched against command output
```

### Field Details

**`discovery.command`** — A shell command that must return a JSON array of objects. Each object becomes an item to process. Template variables (global + task vars) are substituted before execution. Timeout: 30 seconds.

**`discovery.item_key`** — The field in each discovered item used for deduplication. Items with a key already seen in completed/no-action runs are skipped. Error runs are retried.

**`cwd`** — Optional working directory for the Claude process. Supports template variables, so it can be set per-item (e.g., `{{worktree_path}}`). When set, Claude runs inside this directory and can read/edit files, run commands, and pick up `CLAUDE.md` project instructions.

**`prompt_mode`** — Controls how Claude is invoked:
- `per_item`: Claude is called once per discovered item. The item's fields are available as template variables.
- `batch`: Claude is called once with all items. Use `{{items_json}}` (JSON array) or `{{items_list}}` (bullet list) in your prompt.

**`lifecycle`** — When configured, before each run the system checks existing completed/error runs. For each, it executes `resolve_command` (with the item's variables substituted) and matches the output against the `resolve_when` regex. Matching runs are marked as "resolved".

## Global Variables (`vars.yaml`)

Key-value pairs available to all task prompts and discovery commands via `{{variable_name}}` syntax.

```yaml
github_username: noootown
platform_repo: my-org/platform
bot_name: Review Bot
```

## Environment (`.env.local`)

Loaded via dotenv. Used for secrets that shouldn't be in version control.

```bash
GITHUB_TOKEN=ghp_...
SLACK_TOKEN=xoxb-...
```

Both `dev.env` and `.env.local` are loaded, with `.env.local` taking precedence.

## Template Variables

Prompts and discovery commands use `{{variable_name}}` substitution. Variables are merged with this precedence (highest first):

1. **Item variables** — fields from the discovery output JSON
2. **Task variables** — from `config.yaml` `vars:`
3. **Global variables** — from `vars.yaml`

Unresolved `{{placeholders}}` are left as-is.
