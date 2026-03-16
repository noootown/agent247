# agent247

A local CLI tool that runs Claude-powered developer tasks on a cron schedule.

## Install

```bash
git clone <repo-url> agent247
cd agent247
pnpm install && pnpm build
pnpm link --global
```

## Setup

```bash
# Create a workspace (tasks, config, runs live here — separate from the app)
agent247 init <path>

# Point agent247 to your workspace (add to ~/.zshrc or ~/.bashrc)
export AGENT247_BASE_DIR=~/Downloads/agent247-workspace

# Edit your config
cd <path>
vim vars.yaml      # set github username, repo, bot identity
vim .env.local     # set GITHUB_TOKEN, etc.
```

## Usage

```bash
agent247 list                        # list tasks
agent247 run <task-id>               # run a task manually
agent247 sync                        # sync schedules to crontab
agent247 status                      # unreviewed runs
agent247 show <ulid>                 # read a report
agent247 review <ulid>               # mark reviewed
agent247 watch                       # live dashboard
agent247 clean --older-than 7d       # cleanup old runs
```

## Creating Tasks

Each task is a folder with `config.yaml` + `prompt.md`:

```
tasks/
  my-task/
    config.yaml
    prompt.md
```

See [tasks-example/](tasks-example/) for a working reference.

## Development

```bash
pnpm test              # run tests
pnpm dev list          # run without building
pnpm build             # compile
```
