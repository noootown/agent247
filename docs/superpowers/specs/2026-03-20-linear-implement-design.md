# Linear Implement Task — Design Spec

## Overview

A new agent247 task that monitors Linear issues labeled `ready-to-implement`, autonomously implements them via Claude, and creates PRs. Uses the Linear comment thread as an async conversation channel for clarification when needed.

## Mental Model

The user is the architect and orchestrator. They break down large projects into individual Linear tickets, control the queue by adding/removing the `ready-to-implement` label, and review the output via PRs. Claude is the builder — it picks up tickets, clarifies requirements if needed, plans, implements, and opens PRs.

## Lifecycle

```
┌─────────────────────────────────────────────────────────────┐
│  User adds "ready-to-implement" label to Linear issue       │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Discovery: find issues with label, fetch description +     │
│  comment thread                                             │
└──────────────────────┬──────────────────────────────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Claude reads ticket + thread                               │
│                                                             │
│  Simple/clear ticket?                                       │
│    YES → implement directly                                 │
│    NO  → post clarifying questions as Linear comment        │
│          → output NO_ACTION, wait for next run              │
└──────────┬──────────────────────────┬───────────────────────┘
           │ (ready)                  │ (needs answers)
           ▼                          ▼
┌─────────────────────┐  ┌────────────────────────────────────┐
│  /brainstorming      │  │  Next scheduled run:               │
│  → spec → plan       │  │  re-read thread with new answers   │
│  → implement         │  │  → loop until ready                │
│  → push              │  └────────────────────────────────────┘
│  → gh pr create      │
│  → remove label      │
└──────────┬──────────┘
           ▼
┌─────────────────────────────────────────────────────────────┐
│  Linear GitHub integration detects branch/PR automatically  │
│  Ticket status updates via integration                      │
└─────────────────────────────────────────────────────────────┘
```

## Components

### 1. `.env.local` Support (engine change)

**What:** `loadGlobalVars` in `src/lib/config.ts` gains the ability to resolve environment variable references in `vars.yaml` values.

**How:**
1. On startup, if `.env.local` exists in the workspace root, parse it manually (line-by-line `KEY=VALUE`, skip comments/blanks) and inject into `process.env`. No `dotenv` dependency — keep it simple.
2. After parsing `vars.yaml`, scan each string value for env var references matching `/\{\{([A-Z_][A-Z0-9_]*)\}\}/g` (uppercase pattern only).
3. Resolve matches against `process.env`, leaving unresolved references as-is.
4. This resolution happens **once at load time** in `loadGlobalVars`. The returned values are plain strings that flow into the template engine normally.

**Example:**
```yaml
# vars.yaml
linear_api_key: "{{LINEAR_API_KEY}}"
linear_workspace: justice-bid
linear_team_id: JUS
```

```bash
# .env.local
LINEAR_API_KEY=lin_api_xxxxx
```

At runtime, `linear_api_key` resolves to `lin_api_xxxxx` and is available as `{{linear_api_key}}` in all templates.

**Scope:** Only env var references in `vars.yaml` values are resolved. Template variables in config.yaml, prompts, and discovery commands continue to work as before — they just see the resolved values.

**Disambiguation:** Env var references use the same `{{...}}` delimiters as template variables, but are distinguished by the uppercase-only pattern. Lowercase `{{some_var}}` is a template variable (resolved later by the template engine). Uppercase `{{SOME_VAR}}` is an env var (resolved early in `loadGlobalVars`).

### 2. Discovery Script (`discover.sh`)

**Input:** Positional args: `PLATFORM_REPO`, `PLATFORM_REPO_PATH`. Secrets via environment: `LINEAR_API_KEY` (passed through `discoverItems` env parameter, never as CLI arg).

**Behavior:**
1. Query Linear GraphQL API for issues where:
   - Team matches `JUS` (hardcoded in script, or passed as arg)
   - Has label `ready-to-implement`
   - State is not "Done" or "Canceled"
2. For each issue, fetch:
   - `id` (Linear internal UUID)
   - `identifier` (e.g., `JUS-1005`)
   - `title`
   - `description` (markdown)
   - `comments` (full thread, ordered chronologically)
   - `label_id` (the `ready-to-implement` label's UUID, for removal after PR creation)
3. Compute derived fields:
   - `branch_name`: `{identifier}-{slugified_title_first_20_chars}` → e.g., `JUS-1005-aloha-how-are-you` (lowercase, spaces→hyphens, strip non-alphanumeric)
   - `worktree_path`: `{PLATFORM_REPO_PATH}.{branch_name}`
   - `comment_thread`: formatted string of all comments for prompt injection
4. Output JSON array

**Secret handling:** The discovery command does NOT receive `linear_api_key` as a CLI argument (avoids leaking in `ps` output). Instead, `run.ts` passes globalVars as env to `discoverItems`, and the script reads `LINEAR_API_KEY` from the environment. This requires a small engine change: `run.ts` must pass globalVars as env to `discoverItems`.

**item_key:** `identifier`

### 3. Config (`config.yaml`)

```yaml
# ── Task identity & scheduling ──
name: Implement Linear Tickets
schedule: "*/15 * * * *"
timeout: 1800
enabled: true
model: opus
prompt_mode: per_item

# ── Execution pipeline ──
# 1. Discovery (LINEAR_API_KEY passed via env, not CLI arg)
discovery:
  command: bash tasks/linear-implement/discover.sh {{linear_team_id}} {{platform_repo}} {{platform_repo_path}}
  item_key: identifier

# 2. Dedup
bypass_dedup: true
parallel: true

# 3. Pre-run hook
pre_run: git -C {{platform_repo_path}} fetch origin && wt switch {{branch_name}} --no-cd --yes -C {{platform_repo_path}}

# 4. Claude execution
cwd: "{{worktree_path}}"

# 5. Post-run hook
post_run: wt remove {{branch_name}} --yes -C {{platform_repo_path}} && git -C {{platform_repo_path}} branch -D {{branch_name}} 2>/dev/null || true

# 6. Run cleanup — checks if label was removed (meaning PR was created)
cleanup:
  command: bash tasks/linear-implement/cleanup.sh {{id}} {{linear_api_key}}
  when: "false"
  retain: 12h
```

### 4. Prompt (`prompt.md`)

The prompt instructs Claude to:

1. **Read context:** ticket identifier, title, description, and full comment thread
2. **Assess readiness:** Does the ticket + thread provide enough context to implement?
3. **If unclear:** Post a clarifying question to the Linear comment thread via `curl` to Linear API, then output `NO_ACTION`
4. **If clear:** Use `/brainstorming` to explore the problem space — the skill naturally handles simple vs complex:
   - Simple tasks: shortcuts to implementation
   - Complex tasks: produces a spec, then a plan
5. **Implement:** Follow the plan, write code, write tests
6. **Push and PR:** Push the branch, create a PR via `gh pr create`
7. **Remove label:** Remove `ready-to-implement` label from the Linear issue via API call
8. **Output:** First line is the PR URL

**Key prompt details:**
- The comment thread is injected as `{{comment_thread}}` so Claude sees the full async conversation
- Claude uses Linear GraphQL API (via curl) to post comments and remove labels — these are embedded in the prompt as shell commands Claude can run
- The prompt provides the Linear API key as `{{linear_api_key}}` for these API calls

### 5. Label Removal (end of successful run)

After creating the PR, the prompt instructs Claude to run:

```bash
curl -s -X POST \
  -H "Authorization: {{linear_api_key}}" \
  -H "Content-Type: application/json" \
  -d '{"query":"mutation { issueRemoveLabel(id: \"{{id}}\", labelId: \"{{label_id}}\") { success } }"}' \
  https://api.linear.app/graphql
```

The discovery script includes `label_id` (the `ready-to-implement` label's UUID) in the item JSON so Claude has it available. Linear personal API keys are passed as-is in the Authorization header (no `Bearer` prefix).

### 6. Cleanup Script (`cleanup.sh`)

Moved to a separate script to avoid YAML escaping fragility:

```bash
#!/bin/bash
# Check if issue still has ready-to-implement label
# Returns "true" or "false"
ISSUE_ID="$1"
API_KEY="$2"
curl -s -X POST \
  -H "Authorization: $API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"{ issue(id: \\\"$ISSUE_ID\\\") { labels { nodes { name } } } }\"}" \
  https://api.linear.app/graphql \
  | jq '.data.issue.labels.nodes | any(.name == "ready-to-implement")'
```

When this returns `"false"` (label removed = PR was created), the cleanup mechanism archives the run after the retain period.

## What This Does NOT Do

- **No Linear status management** — Linear's GitHub integration handles status transitions when it detects the branch/PR
- **No comment posting for PR links** — branch naming convention (`JUS-1005-...`) triggers Linear's auto-linking
- **No complex multi-label workflows** — single label `ready-to-implement` is the only interface
- **No throttling logic in the engine** — user controls queue size by managing labels manually
- **No ticket dependency awareness** — user orchestrates the DAG by controlling which tickets get the label and when

## Edge Cases

1. **Ticket updated mid-implementation:** Since `bypass_dedup: true`, the next run would pick it up again. But if Claude already created a PR, the label would be removed, so it won't be rediscovered.

2. **Claude fails mid-implementation:** Post-run hook cleans up the worktree. Next run, the ticket still has the label, so Claude tries again with a fresh worktree. Previous partial work on the branch may still exist on remote — the prompt instructs Claude to `git pull` if the branch already exists on remote.

3. **Multiple runs for same ticket (Q&A phase):** Each run creates a new worktree, reads the thread, and either asks another question or implements. The worktree is cleaned up after each run regardless. Q&A runs are marked `completed` with NO_ACTION and eventually cleaned up.

4. **Pre-run fails (branch already exists in worktree):** The `wt switch` command should handle existing branches. If it fails, the run is marked as error and post-run cleans up.

5. **Retry storm (deterministic failure):** If a ticket consistently fails (e.g., too complex, ambiguous), it will retry every 15 minutes. Mitigation: the prompt instructs Claude to post a "blocked" comment on the Linear issue and output NO_ACTION if it has failed the same task in 3+ consecutive runs (Claude can detect this from the comment thread). The user can then remove the label manually.

6. **`gh pr create` fails:** The prompt instructs Claude to check for existing PRs on the branch before creating a new one (`gh pr list --head {{branch_name}}`). If a PR already exists, skip creation and just ensure the label is removed.

## New vars.yaml Fields

```yaml
# Linear
linear_api_key: "{{LINEAR_API_KEY}}"
linear_workspace: justice-bid
linear_team_id: JUS
```

## Changes Required

### Engine changes
1. **`src/lib/config.ts`** — Add `.env.local` loading and env var resolution in `loadGlobalVars`:
   - Parse `.env.local` (manual line-by-line, no dotenv dependency)
   - Resolve `{{UPPER_CASE}}` references in vars.yaml values against `process.env`
2. **`src/commands/run.ts`** — Pass `globalVars` as env to `discoverItems` call (line ~53), converting lowercase keys to uppercase for env convention

### Workspace changes
3. **`workspace/vars.yaml`** — Add Linear variables
4. **`workspace/.env.local`** — Add `LINEAR_API_KEY` (user-managed, already gitignored)
5. **`workspace/tasks/linear-implement/`** — New task directory:
   - `config.yaml` — Task configuration
   - `discover.sh` — Linear API discovery script
   - `cleanup.sh` — Label check for run cleanup
   - `prompt.md` — Claude prompt
