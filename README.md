# agent247

A local daemon framework that runs Claude-powered developer tasks on a cron schedule, tracks results, and waits for your review.

## Installation

```bash
# Clone and install
git clone <repo-url> agent247
cd agent247
pnpm install

# Build
pnpm build

# Link globally (adds `agent247` to your PATH)
pnpm link --global

# Copy dev.env to .env.local and fill in your secrets
cp dev.env .env.local
# Edit .env.local with your GITHUB_TOKEN, etc.
```

## Quick Start

### 1. Create a task

Each task is a folder under `tasks/` with two files:

```
tasks/
  my-task/
    config.yaml   # schedule, discovery, lifecycle
    prompt.md     # the prompt sent to Claude
```

See `tasks-example/` for a working example. To get started:

```bash
cp -r tasks-example/review-dependabot tasks/review-dependabot
```

### 2. Configure global variables

Edit `vars.yaml` to set variables available to all task prompts:

```yaml
github_username: your-username
platform_repo_path: /path/to/your/project
```

### 3. Sync to crontab

```bash
agent247 sync
```

This writes a fenced section to your crontab. Your other cron jobs are untouched.

### 4. Monitor

```bash
# See what's unreviewed
agent247 status

# Auto-refreshing dashboard (great for a tmux pane)
agent247 watch

# Read a specific report
agent247 show <ulid>

# Mark as reviewed
agent247 review <ulid>
```

## Task Config Reference

```yaml
name: Review Dependabot PRs        # human-readable name
schedule: "*/30 * * * *"           # cron expression
timeout: 300                        # max seconds per Claude invocation
enabled: true                       # set false to skip during sync

vars:                               # task-level vars (override vars.yaml)
  repo_owner: myuser

discovery:
  command: "gh pr list --json url"  # must return JSON array
  item_key: url                     # field used for dedup

prompt_mode: per_item               # per_item | batch

lifecycle:
  auto_resolve: true
  resolve_command: "gh pr view {{url}} --json state -q '.state'"
  resolve_when: "MERGED|CLOSED"     # regex — if output matches, run is resolved
```

## Template Variables

Prompts use `{{var_name}}` syntax. Variable precedence (highest wins):

1. **Item fields** — from discovery output (e.g. `{{url}}`, `{{title}}`)
2. **Task vars** — from `config.yaml` `vars:` section
3. **Global vars** — from `vars.yaml`

For `batch` mode, use `{{items_json}}` (JSON string) or `{{items_list}}` (markdown bullet list).

## CLI Commands

| Command | Description |
|---------|-------------|
| `agent247 list` | List all defined tasks |
| `agent247 run <task-id>` | Execute a task manually |
| `agent247 sync` | Sync enabled tasks to crontab |
| `agent247 status [--all] [--task <id>]` | Show unreviewed runs |
| `agent247 show <ulid>` | Display a run's report |
| `agent247 review <ulid>` | Mark a run as reviewed |
| `agent247 watch` | Auto-refreshing dashboard |
| `agent247 clean --older-than <duration>` | Delete old runs (e.g. `7d`, `24h`) |

## Run Statuses

- **skipped** — no new items found (dedup filtered everything)
- **no-action** — Claude analyzed the item and found nothing to do
- **completed** — meaningful work done, awaiting your review
- **error** — something failed (retried on next run)
- **resolved** — work item is no longer relevant (e.g. PR merged)

## Environment Variables

Secrets go in `.env.local` (gitignored). See `dev.env` for required variables.

Environment variables are available to discovery commands, lifecycle commands, and the Claude process. They are NOT available as `{{var}}` template variables — use `vars.yaml` for that.

## Development

```bash
# Run tests
pnpm test

# Run a command in dev mode (no build needed)
pnpm dev list

# Build
pnpm build
```
