# Pre/Post Run Hooks Design

## Problem

Some tasks need environment setup before Claude runs (e.g., creating a git worktree) and cleanup after (e.g., removing the worktree). Currently there's no mechanism for this — worktree management is either in discovery scripts (which run before dedup, wasting resources on skipped items) or not done at all.

## Design

Add optional `pre_run` and `post_run` fields to task config. These are shell commands executed synchronously by the runner before and after each Claude invocation.

### Lifecycle

```
Discovery → Dedup → [pre_run] → Claude execution → [post_run] → Cleanup
```

- `pre_run` and `post_run` are per-item (run once per discovered item that passes dedup)
- Both are optional — if not specified, skipped entirely
- Both are blocking/synchronous
- Both support template variables (global + task + item)

### Config

```yaml
name: Review PRs
schedule: 0 */1 * * *
timeout: 900
enabled: true
model: sonnet
prompt_mode: per_item
parallel: true
cwd: "{{worktree_path}}"
pre_run: wt switch {{headRefName}} --no-cd --yes -C {{platform_repo_path}}
post_run: wt remove {{headRefName}} --yes -C {{platform_repo_path}}
discovery:
  command: bash tasks/pr-review/discover.sh {{github_username}} {{platform_repo}}
  item_key: url
```

### Discovery

Discovery scripts compute `worktree_path` deterministically from the branch name without creating the worktree:

```bash
# jq: replace / with - in branch name (matches wt's sanitize filter)
worktree_path: ($repo_path + "/../platform." + (.headRefName | gsub("/"; "-")))
```

The worktree doesn't exist yet at discovery time — it's just a path computation. `pre_run` creates it later.

### Runner Behavior

In `executeForItem` (run.ts):

```
1. Render pre_run with template variables
2. execSync(pre_run) — blocking
3. If pre_run fails → mark run as error, skip to post_run
4. Render cwd + prompt (worktree_path now resolves to a real path)
5. Execute Claude (async spawn)
6. Write results
7. Render post_run with template variables
8. execSync(post_run) — blocking, in finally block
```

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `pre_run` not specified | Skip, proceed to Claude |
| `post_run` not specified | Skip |
| `pre_run` fails | Mark run as error, still execute `post_run` |
| `post_run` fails | Log warning, don't affect run status |
| Claude times out | `post_run` still runs |
| Claude errors | `post_run` still runs |
| Process killed (SIGTERM) | `post_run` best-effort via signal handler |

### Template Variables

Both hooks have access to the same variables as the prompt:

- **Global variables** from `vars.yaml` (e.g., `{{platform_repo_path}}`)
- **Task variables** from config `vars:`
- **Item variables** from discovery output (e.g., `{{headRefName}}`, `{{worktree_path}}`)

### TaskConfig Changes

```typescript
interface TaskConfig {
  // ... existing fields
  pre_run?: string;   // Shell command, executed before Claude
  post_run?: string;  // Shell command, executed after Claude (always)
}
```

### Enabling Parallel Execution

With worktree-per-item via hooks, parallel execution becomes safe for review tasks:

- `pr-review`: `parallel: true` — each item gets its own worktree
- `pr-review-dependabot`: `parallel: true` — same
- `pr-fix-ci-conflicts`: stays sequential — pushes to branches
- `pr-resolve-coderabbit`: stays sequential — shared worktree

## Files to Change

1. **`src/lib/config.ts`** — add `pre_run` and `post_run` to `TaskConfig`
2. **`src/commands/run.ts`** — execute hooks in `executeForItem` and `executeForBatch`
3. **`workspace/tasks/pr-review/discover.sh`** — compute `worktree_path` deterministically
4. **`workspace/tasks/pr-review/config.yaml`** — add hooks and `parallel: true`
5. **`workspace/tasks/pr-review-dependabot/discover.sh`** — same
6. **`workspace/tasks/pr-review-dependabot/config.yaml`** — same
7. **`docs/config.md`** — document new fields
