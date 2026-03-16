# agent247 Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript CLI tool that schedules Claude-powered developer tasks via cron, deduplicates work items, and provides a review workflow.

**Architecture:** Task-as-folder pattern with YAML configs and Markdown prompts. Filesystem-based run storage using ULIDs. CLI commands for sync, run, status, review, clean, and watch. Fenced crontab management.

**Tech Stack:** TypeScript, Node.js, commander (CLI), js-yaml (config), ulid (IDs), dotenv (env files)

---

## File Map

### Project config
- `package.json` — dependencies, bin entry, scripts
- `tsconfig.json` — TypeScript config (ES2022, NodeNext modules)
- `.gitignore` — ignore runs/, .env.local, node_modules, dist/
- `dev.env` — template for required env vars
- `vars.yaml` — global template variables

### Library modules (`src/lib/`)
- `config.ts` — load and validate task configs, global vars, env files. Exports `loadTaskConfig()`, `loadGlobalVars()`, `loadEnv()`, `listTasks()`
- `template.ts` — `{{var}}` substitution with precedence. Exports `render(template, vars)`
- `lock.ts` — PID-file locking. Exports `acquireLock(taskId)`, `releaseLock(taskId)`
- `discovery.ts` — run discovery commands, parse JSON. Exports `discoverItems(config)`
- `dedup.ts` — scan runs for existing items. Exports `filterNewItems(taskId, items, itemKey)`
- `lifecycle.ts` — resolve completed/error runs. Exports `resolveRuns(taskId, config)`
- `runner.ts` — spawn claude process, capture output. Exports `executePrompt(renderedPrompt, timeout)`
- `report.ts` — write run artifacts. Exports `writeRun(runDir, data)`, `readRun(runDir)`, `listRuns(filter)`
- `crontab.ts` — fenced crontab read/write. Exports `syncCrontab(tasks)`
- `logger.ts` — timestamped log writing. Exports `createLogger(logPath)`

### CLI commands (`src/commands/`)
- `run.ts` — full run lifecycle (lock → lifecycle → discover → dedup → execute → report → unlock)
- `sync.ts` — read task configs, generate crontab, write fenced section
- `status.ts` — list unreviewed runs
- `list.ts` — list defined tasks
- `show.ts` — display a run's report
- `review.ts` — mark run as reviewed
- `clean.ts` — delete old runs
- `watch.ts` — auto-refreshing dashboard

### Entry point
- `src/cli.ts` — commander program setup, register all commands

### Test files (`src/__tests__/`)
- `template.test.ts`
- `lock.test.ts`
- `config.test.ts`
- `dedup.test.ts`
- `lifecycle.test.ts`
- `crontab.test.ts`
- `discovery.test.ts`
- `runner.test.ts`
- `report.test.ts`
- `commands/run.test.ts`

---

## Chunk 1: Project Setup + Core Libraries

### Task 1: Project scaffolding

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `.gitignore`
- Create: `dev.env`
- Create: `vars.yaml`

- [ ] **Step 1: Initialize project**

```bash
cd /Users/noootown/Downloads/247
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install commander js-yaml ulid dotenv
npm install -D typescript @types/node @types/js-yaml vitest tsx
```

- [ ] **Step 3: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "declaration": true,
    "sourceMap": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 4: Write .gitignore**

```
node_modules/
dist/
runs/
.env.local
*.lock
```

- [ ] **Step 5: Write dev.env**

```bash
# agent247 — required environment variables
# Copy to .env.local and fill in actual values
GITHUB_TOKEN=
SLACK_TOKEN=
```

- [ ] **Step 6: Write vars.yaml**

```yaml
github_username: noootown
platform_repo_path: /Users/noootown/Downloads/projects/platform
```

- [ ] **Step 7: Update package.json with bin and scripts**

Add to package.json:
```json
{
  "type": "module",
  "bin": {
    "agent247": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsx src/cli.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

- [ ] **Step 8: Create directory structure**

```bash
mkdir -p src/lib src/commands src/__tests__/commands tasks runs
```

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json .gitignore dev.env vars.yaml package-lock.json
git commit -m "chore: scaffold agent247 project"
```

---

### Task 2: Logger utility

**Files:**
- Create: `src/lib/logger.ts`

- [ ] **Step 1: Write logger**

```typescript
// src/lib/logger.ts
import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface Logger {
  log(message: string): void;
  error(message: string): void;
  getEntries(): string[];
}

export function createLogger(logPath: string): Logger {
  const entries: string[] = [];

  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, "");

  const append = (level: string, message: string) => {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    entries.push(line);
    appendFileSync(logPath, line + "\n");
  };

  return {
    log: (msg) => append("INFO", msg),
    error: (msg) => append("ERROR", msg),
    getEntries: () => [...entries],
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/logger.ts
git commit -m "feat: add logger utility"
```

---

### Task 3: Template engine

**Files:**
- Create: `src/lib/template.ts`
- Create: `src/__tests__/template.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/template.test.ts
import { describe, it, expect } from "vitest";
import { render } from "../lib/template.js";

describe("template", () => {
  it("substitutes simple variables", () => {
    expect(render("Hello {{name}}", { name: "world" })).toBe("Hello world");
  });

  it("substitutes multiple variables", () => {
    expect(render("{{a}} and {{b}}", { a: "1", b: "2" })).toBe("1 and 2");
  });

  it("leaves unmatched placeholders as-is", () => {
    expect(render("Hello {{unknown}}", {})).toBe("Hello {{unknown}}");
  });

  it("handles variable precedence (item > task > global)", () => {
    const global = { url: "global", name: "global-name" };
    const task = { url: "task" };
    const item = { url: "item" };
    expect(render("{{url}} {{name}}", global, task, item)).toBe(
      "item global-name"
    );
  });

  it("handles empty template", () => {
    expect(render("", { name: "test" })).toBe("");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/template.test.ts
```
Expected: FAIL — module not found

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/template.ts
export function render(
  template: string,
  globalVars: Record<string, string> = {},
  taskVars: Record<string, string> = {},
  itemVars: Record<string, string> = {}
): string {
  // Merge with precedence: item > task > global
  const merged = { ...globalVars, ...taskVars, ...itemVars };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in merged ? String(merged[key]) : match;
  });
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/template.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/template.ts src/__tests__/template.test.ts
git commit -m "feat: add template engine with variable precedence"
```

---

### Task 4: Config loader

**Files:**
- Create: `src/lib/config.ts`
- Create: `src/__tests__/config.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/config.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadTaskConfig, loadGlobalVars, listTasks } from "../lib/config.js";

const TEST_DIR = join(process.cwd(), "__test_config_tmp__");

beforeEach(() => {
  mkdirSync(join(TEST_DIR, "tasks", "test-task"), { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("loadTaskConfig", () => {
  it("parses a valid task config", () => {
    writeFileSync(
      join(TEST_DIR, "tasks", "test-task", "config.yaml"),
      `name: Test Task
schedule: "*/30 * * * *"
timeout: 300
enabled: true
discovery:
  command: "echo '[]'"
  item_key: url
prompt_mode: per_item
`
    );
    writeFileSync(
      join(TEST_DIR, "tasks", "test-task", "prompt.md"),
      "Test prompt {{url}}"
    );
    const config = loadTaskConfig("test-task", TEST_DIR);
    expect(config.name).toBe("Test Task");
    expect(config.schedule).toBe("*/30 * * * *");
    expect(config.timeout).toBe(300);
    expect(config.enabled).toBe(true);
    expect(config.discovery.command).toBe("echo '[]'");
    expect(config.discovery.item_key).toBe("url");
    expect(config.prompt_mode).toBe("per_item");
    expect(config.prompt).toBe("Test prompt {{url}}");
  });
});

describe("loadGlobalVars", () => {
  it("loads vars.yaml", () => {
    writeFileSync(
      join(TEST_DIR, "vars.yaml"),
      "github_username: testuser\nrepo: testrepo\n"
    );
    const vars = loadGlobalVars(TEST_DIR);
    expect(vars.github_username).toBe("testuser");
    expect(vars.repo).toBe("testrepo");
  });

  it("returns empty object if vars.yaml missing", () => {
    const vars = loadGlobalVars(TEST_DIR);
    expect(vars).toEqual({});
  });
});

describe("listTasks", () => {
  it("lists task directories", () => {
    writeFileSync(
      join(TEST_DIR, "tasks", "test-task", "config.yaml"),
      "name: Test\nschedule: '* * * * *'\ntimeout: 60\nenabled: true\ndiscovery:\n  command: echo\n  item_key: id\nprompt_mode: per_item\n"
    );
    writeFileSync(
      join(TEST_DIR, "tasks", "test-task", "prompt.md"),
      "prompt"
    );
    const tasks = listTasks(TEST_DIR);
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("test-task");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/config.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/config.ts
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { config as dotenvConfig } from "dotenv";

export interface TaskConfig {
  id: string;
  name: string;
  schedule: string;
  timeout: number;
  enabled: boolean;
  vars?: Record<string, string>;
  discovery: {
    command: string;
    item_key: string;
  };
  prompt_mode: "per_item" | "batch";
  lifecycle?: {
    auto_resolve: boolean;
    resolve_command: string;
    resolve_when: string;
  };
  prompt: string;
}

export function loadTaskConfig(taskId: string, baseDir: string): TaskConfig {
  const taskDir = join(baseDir, "tasks", taskId);
  const configPath = join(taskDir, "config.yaml");
  const promptPath = join(taskDir, "prompt.md");

  const raw = yaml.load(readFileSync(configPath, "utf-8")) as Record<
    string,
    unknown
  >;
  if (!raw || typeof raw !== "object") {
    throw new Error(`Invalid config for task ${taskId}: empty or not an object`);
  }
  for (const field of ["name", "schedule", "timeout", "enabled", "discovery"]) {
    if (!(field in raw)) {
      throw new Error(`Task ${taskId} config missing required field: ${field}`);
    }
  }
  const prompt = readFileSync(promptPath, "utf-8");

  return {
    id: taskId,
    name: raw.name as string,
    schedule: raw.schedule as string,
    timeout: raw.timeout as number,
    enabled: raw.enabled as boolean,
    vars: raw.vars as Record<string, string> | undefined,
    discovery: raw.discovery as { command: string; item_key: string },
    prompt_mode: (raw.prompt_mode as string) === "batch" ? "batch" : "per_item",
    lifecycle: raw.lifecycle as TaskConfig["lifecycle"],
    prompt,
  };
}

export function loadGlobalVars(baseDir: string): Record<string, string> {
  const varsPath = join(baseDir, "vars.yaml");
  if (!existsSync(varsPath)) return {};
  const raw = yaml.load(readFileSync(varsPath, "utf-8")) as Record<
    string,
    string
  >;
  return raw ?? {};
}

export function loadEnv(baseDir: string): void {
  const devEnvPath = join(baseDir, "dev.env");
  const localEnvPath = join(baseDir, ".env.local");

  if (existsSync(devEnvPath)) {
    dotenvConfig({ path: devEnvPath });
  }
  if (existsSync(localEnvPath)) {
    dotenvConfig({ path: localEnvPath, override: true });
  }
}

export function listTasks(
  baseDir: string
): Array<{ id: string; config: TaskConfig }> {
  const tasksDir = join(baseDir, "tasks");
  if (!existsSync(tasksDir)) return [];

  return readdirSync(tasksDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(tasksDir, d.name, "config.yaml")))
    .map((d) => ({
      id: d.name,
      config: loadTaskConfig(d.name, baseDir),
    }));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/config.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/config.ts src/__tests__/config.test.ts
git commit -m "feat: add config loader with task and global vars support"
```

---

### Task 5: PID-file lock

**Files:**
- Create: `src/lib/lock.ts`
- Create: `src/__tests__/lock.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/lock.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  mkdirSync,
  rmSync,
  writeFileSync,
  readFileSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import { acquireLock, releaseLock } from "../lib/lock.js";

const TEST_DIR = join(process.cwd(), "__test_lock_tmp__");
const TASK_DIR = join(TEST_DIR, "tasks", "test-task");

beforeEach(() => {
  mkdirSync(TASK_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("lock", () => {
  it("acquires lock when no lock exists", () => {
    const acquired = acquireLock("test-task", TEST_DIR);
    expect(acquired).toBe(true);
    expect(existsSync(join(TASK_DIR, ".lock"))).toBe(true);
  });

  it("writes current PID to lock file", () => {
    acquireLock("test-task", TEST_DIR);
    const pid = readFileSync(join(TASK_DIR, ".lock"), "utf-8").trim();
    expect(pid).toBe(String(process.pid));
  });

  it("fails to acquire lock when PID is alive", () => {
    // Write current PID (which is alive)
    writeFileSync(join(TASK_DIR, ".lock"), String(process.pid));
    const acquired = acquireLock("test-task", TEST_DIR);
    expect(acquired).toBe(false);
  });

  it("acquires lock when PID is stale (dead process)", () => {
    // Write a PID that almost certainly doesn't exist
    writeFileSync(join(TASK_DIR, ".lock"), "999999999");
    const acquired = acquireLock("test-task", TEST_DIR);
    expect(acquired).toBe(true);
  });

  it("releases lock", () => {
    acquireLock("test-task", TEST_DIR);
    releaseLock("test-task", TEST_DIR);
    expect(existsSync(join(TASK_DIR, ".lock"))).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/lock.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/lock.ts
import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(taskId: string, baseDir: string): boolean {
  const lockPath = join(baseDir, "tasks", taskId, ".lock");

  if (existsSync(lockPath)) {
    const pid = parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
    if (!isNaN(pid) && isProcessAlive(pid)) {
      return false;
    }
    // Stale lock — remove it
    unlinkSync(lockPath);
  }

  writeFileSync(lockPath, String(process.pid));
  return true;
}

export function releaseLock(taskId: string, baseDir: string): void {
  const lockPath = join(baseDir, "tasks", taskId, ".lock");
  if (existsSync(lockPath)) {
    unlinkSync(lockPath);
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/lock.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/lock.ts src/__tests__/lock.test.ts
git commit -m "feat: add PID-file lock for task concurrency control"
```

---

### Task 6: Report writer/reader

**Files:**
- Create: `src/lib/report.ts`
- Create: `src/__tests__/report.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/report.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { writeRun, readRun, listRuns, type RunMeta } from "../lib/report.js";

const TEST_DIR = join(process.cwd(), "__test_report_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs");

beforeEach(() => {
  mkdirSync(RUNS_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("writeRun", () => {
  it("writes all artifacts for a completed run", () => {
    const runId = "01TEST00000000000000000001";
    const runDir = join(RUNS_DIR, runId);

    writeRun(runDir, {
      meta: {
        schema_version: 1,
        id: runId,
        task: "test-task",
        status: "completed",
        reviewed: false,
        url: "https://example.com/pr/1",
        item_key: "https://example.com/pr/1",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 0,
      },
      prompt: "rendered prompt",
      rawJson: '{"result": "test"}',
      report: "# Report\nAll good",
      log: "[INFO] done",
    });

    expect(existsSync(join(runDir, "meta.yaml"))).toBe(true);
    expect(existsSync(join(runDir, "prompt.rendered.md"))).toBe(true);
    expect(existsSync(join(runDir, "raw.json"))).toBe(true);
    expect(existsSync(join(runDir, "report.md"))).toBe(true);
    expect(existsSync(join(runDir, "log.txt"))).toBe(true);
  });

  it("writes only meta and log for skipped runs", () => {
    const runId = "01TEST00000000000000000002";
    const runDir = join(RUNS_DIR, runId);

    writeRun(runDir, {
      meta: {
        schema_version: 1,
        id: runId,
        task: "test-task",
        status: "skipped",
        reviewed: false,
        url: null,
        item_key: null,
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:00:01Z",
        duration_seconds: 1,
        exit_code: 0,
      },
      log: "[INFO] no items",
    });

    expect(existsSync(join(runDir, "meta.yaml"))).toBe(true);
    expect(existsSync(join(runDir, "log.txt"))).toBe(true);
    expect(existsSync(join(runDir, "report.md"))).toBe(false);
  });
});

describe("readRun", () => {
  it("reads meta from a run directory", () => {
    const runId = "01TEST00000000000000000003";
    const runDir = join(RUNS_DIR, runId);

    writeRun(runDir, {
      meta: {
        schema_version: 1,
        id: runId,
        task: "test-task",
        status: "completed",
        reviewed: false,
        url: "https://example.com",
        item_key: "https://example.com",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 0,
      },
      report: "test report",
      log: "log",
    });

    const run = readRun(runDir);
    expect(run.meta.task).toBe("test-task");
    expect(run.meta.status).toBe("completed");
  });
});

describe("listRuns", () => {
  it("lists runs filtered by task", () => {
    for (const [id, task] of [
      ["01TEST0000000000000000A001", "task-a"],
      ["01TEST0000000000000000B001", "task-b"],
    ] as const) {
      writeRun(join(RUNS_DIR, id), {
        meta: {
          schema_version: 1,
          id,
          task,
          status: "completed",
          reviewed: false,
          url: null,
          item_key: null,
          started_at: "2026-03-15T10:00:00Z",
          finished_at: "2026-03-15T10:01:00Z",
          duration_seconds: 60,
          exit_code: 0,
        },
        log: "log",
      });
    }

    const all = listRuns(RUNS_DIR);
    expect(all).toHaveLength(2);

    const filtered = listRuns(RUNS_DIR, { task: "task-a" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].meta.task).toBe("task-a");
  });

  it("filters by status", () => {
    writeRun(join(RUNS_DIR, "01TEST000000000000000SKIP1"), {
      meta: {
        schema_version: 1,
        id: "01TEST000000000000000SKIP1",
        task: "t",
        status: "skipped",
        reviewed: false,
        url: null,
        item_key: null,
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:00:01Z",
        duration_seconds: 1,
        exit_code: 0,
      },
      log: "log",
    });
    writeRun(join(RUNS_DIR, "01TEST000000000000000COMP1"), {
      meta: {
        schema_version: 1,
        id: "01TEST000000000000000COMP1",
        task: "t",
        status: "completed",
        reviewed: false,
        url: null,
        item_key: null,
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 0,
      },
      log: "log",
    });

    const completed = listRuns(RUNS_DIR, { status: "completed" });
    expect(completed).toHaveLength(1);
    expect(completed[0].meta.status).toBe("completed");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/report.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/report.ts
import {
  mkdirSync,
  writeFileSync,
  readFileSync,
  readdirSync,
  existsSync,
} from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface RunMeta {
  schema_version: number;
  id: string;
  task: string;
  status: "skipped" | "no-action" | "completed" | "error" | "resolved";
  reviewed: boolean;
  url: string | null;
  item_key: string | null;
  started_at: string;
  finished_at: string;
  duration_seconds: number;
  exit_code: number;
}

export interface RunData {
  meta: RunMeta;
  prompt?: string;
  rawJson?: string;
  report?: string;
  log: string;
}

export interface RunRecord {
  meta: RunMeta;
  report?: string;
  dir: string;
}

export function writeRun(runDir: string, data: RunData): void {
  mkdirSync(runDir, { recursive: true });
  writeFileSync(join(runDir, "meta.yaml"), yaml.dump(data.meta));
  writeFileSync(join(runDir, "log.txt"), data.log);

  if (data.prompt !== undefined) {
    writeFileSync(join(runDir, "prompt.rendered.md"), data.prompt);
  }
  if (data.rawJson !== undefined) {
    writeFileSync(join(runDir, "raw.json"), data.rawJson);
  }
  if (data.report !== undefined) {
    writeFileSync(join(runDir, "report.md"), data.report);
  }
}

export function updateRunMeta(runDir: string, updates: Partial<RunMeta>): void {
  const metaPath = join(runDir, "meta.yaml");
  const existing = yaml.load(readFileSync(metaPath, "utf-8")) as RunMeta;
  writeFileSync(metaPath, yaml.dump({ ...existing, ...updates }));
}

export function readRun(runDir: string): RunRecord {
  const metaPath = join(runDir, "meta.yaml");
  const meta = yaml.load(readFileSync(metaPath, "utf-8")) as RunMeta;
  const reportPath = join(runDir, "report.md");
  const report = existsSync(reportPath)
    ? readFileSync(reportPath, "utf-8")
    : undefined;
  return { meta, report, dir: runDir };
}

export interface RunFilter {
  task?: string;
  status?: RunMeta["status"];
  reviewed?: boolean;
}

export function listRuns(runsDir: string, filter?: RunFilter): RunRecord[] {
  if (!existsSync(runsDir)) return [];

  const entries = readdirSync(runsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .filter((d) => existsSync(join(runsDir, d.name, "meta.yaml")));

  let runs = entries.map((d) => readRun(join(runsDir, d.name)));

  if (filter?.task) runs = runs.filter((r) => r.meta.task === filter.task);
  if (filter?.status)
    runs = runs.filter((r) => r.meta.status === filter.status);
  if (filter?.reviewed !== undefined)
    runs = runs.filter((r) => r.meta.reviewed === filter.reviewed);

  // Sort by ULID (which is chronological)
  runs.sort((a, b) => a.meta.id.localeCompare(b.meta.id));

  return runs;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/report.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/report.ts src/__tests__/report.test.ts
git commit -m "feat: add run report writer/reader with filtering"
```

---

### Task 7: Discovery module

**Files:**
- Create: `src/lib/discovery.ts`
- Create: `src/__tests__/discovery.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/discovery.test.ts
import { describe, it, expect } from "vitest";
import { discoverItems } from "../lib/discovery.js";

describe("discoverItems", () => {
  it("parses JSON array from command output", async () => {
    const items = await discoverItems(
      `echo '[{"url":"https://example.com/1","title":"PR 1"}]'`
    );
    expect(items).toEqual([
      { url: "https://example.com/1", title: "PR 1" },
    ]);
  });

  it("returns empty array for empty JSON array", async () => {
    const items = await discoverItems("echo '[]'");
    expect(items).toEqual([]);
  });

  it("throws on non-zero exit code", async () => {
    await expect(discoverItems("exit 1")).rejects.toThrow();
  });

  it("throws on invalid JSON", async () => {
    await expect(discoverItems("echo 'not json'")).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/discovery.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/discovery.ts
import { execSync } from "node:child_process";

export async function discoverItems(
  command: string,
  env?: Record<string, string>
): Promise<Record<string, string>[]> {
  const output = execSync(command, {
    encoding: "utf-8",
    timeout: 30_000,
    shell: "/bin/bash",
    env: { ...process.env, ...env },
  });

  const parsed = JSON.parse(output.trim());
  if (!Array.isArray(parsed)) {
    throw new Error(`Discovery command must return a JSON array, got: ${typeof parsed}`);
  }
  return parsed;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/discovery.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/discovery.ts src/__tests__/discovery.test.ts
git commit -m "feat: add discovery module for work item detection"
```

---

### Task 8: Dedup module

**Files:**
- Create: `src/lib/dedup.ts`
- Create: `src/__tests__/dedup.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/dedup.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { filterNewItems } from "../lib/dedup.js";
import { writeRun } from "../lib/report.js";

const TEST_DIR = join(process.cwd(), "__test_dedup_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs");

beforeEach(() => {
  mkdirSync(RUNS_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("filterNewItems", () => {
  it("returns all items when no runs exist", () => {
    const items = [{ url: "https://example.com/1" }];
    const result = filterNewItems(RUNS_DIR, "task-a", items, "url");
    expect(result).toEqual(items);
  });

  it("filters out items with completed runs", () => {
    writeRun(join(RUNS_DIR, "01RUN001"), {
      meta: {
        schema_version: 1,
        id: "01RUN001",
        task: "task-a",
        status: "completed",
        reviewed: false,
        url: "https://example.com/1",
        item_key: "https://example.com/1",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 0,
      },
      log: "done",
    });

    const items = [
      { url: "https://example.com/1" },
      { url: "https://example.com/2" },
    ];
    const result = filterNewItems(RUNS_DIR, "task-a", items, "url");
    expect(result).toEqual([{ url: "https://example.com/2" }]);
  });

  it("includes items whose previous run was an error (retry)", () => {
    writeRun(join(RUNS_DIR, "01RUN002"), {
      meta: {
        schema_version: 1,
        id: "01RUN002",
        task: "task-a",
        status: "error",
        reviewed: false,
        url: "https://example.com/1",
        item_key: "https://example.com/1",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 1,
      },
      log: "failed",
    });

    const items = [{ url: "https://example.com/1" }];
    const result = filterNewItems(RUNS_DIR, "task-a", items, "url");
    expect(result).toEqual(items);
  });

  it("does not filter items from different tasks", () => {
    writeRun(join(RUNS_DIR, "01RUN003"), {
      meta: {
        schema_version: 1,
        id: "01RUN003",
        task: "task-b",
        status: "completed",
        reviewed: false,
        url: "https://example.com/1",
        item_key: "https://example.com/1",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 0,
      },
      log: "done",
    });

    const items = [{ url: "https://example.com/1" }];
    const result = filterNewItems(RUNS_DIR, "task-a", items, "url");
    expect(result).toEqual(items);
  });

  it("ignores resolved runs (item can be re-processed)", () => {
    writeRun(join(RUNS_DIR, "01RUN004"), {
      meta: {
        schema_version: 1,
        id: "01RUN004",
        task: "task-a",
        status: "resolved",
        reviewed: false,
        url: "https://example.com/1",
        item_key: "https://example.com/1",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 0,
      },
      log: "done",
    });

    const items = [{ url: "https://example.com/1" }];
    const result = filterNewItems(RUNS_DIR, "task-a", items, "url");
    expect(result).toEqual(items);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/dedup.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/dedup.ts
import { listRuns } from "./report.js";

export function filterNewItems(
  runsDir: string,
  taskId: string,
  items: Record<string, string>[],
  itemKey: string
): Record<string, string>[] {
  const runs = listRuns(runsDir, { task: taskId });

  // Collect item_keys that have completed (non-resolved) runs — these should be skipped.
  // Error runs are NOT added here, so they will be retried.
  const completedKeys = new Set(
    runs
      .filter((r) => r.meta.status === "completed" || r.meta.status === "no-action")
      .map((r) => r.meta.item_key)
  );

  return items.filter((item) => !completedKeys.has(item[itemKey]));
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/dedup.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/dedup.ts src/__tests__/dedup.test.ts
git commit -m "feat: add dedup module with error retry support"
```

---

### Task 9: Lifecycle module

**Files:**
- Create: `src/lib/lifecycle.ts`
- Create: `src/__tests__/lifecycle.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/lifecycle.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { resolveRuns } from "../lib/lifecycle.js";
import { writeRun, readRun } from "../lib/report.js";

const TEST_DIR = join(process.cwd(), "__test_lifecycle_tmp__");
const RUNS_DIR = join(TEST_DIR, "runs");

beforeEach(() => {
  mkdirSync(RUNS_DIR, { recursive: true });
});

afterEach(() => {
  rmSync(TEST_DIR, { recursive: true, force: true });
});

describe("resolveRuns", () => {
  it("marks completed run as resolved when resolve command matches", async () => {
    const runDir = join(RUNS_DIR, "01RESOLVE001");
    writeRun(runDir, {
      meta: {
        schema_version: 1,
        id: "01RESOLVE001",
        task: "task-a",
        status: "completed",
        reviewed: false,
        url: "https://example.com/1",
        item_key: "https://example.com/1",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 0,
      },
      log: "done",
    });

    const resolved = await resolveRuns(RUNS_DIR, "task-a", {
      auto_resolve: true,
      resolve_command: "echo MERGED",
      resolve_when: "MERGED|CLOSED",
    });

    expect(resolved).toBe(1);
    const run = readRun(runDir);
    expect(run.meta.status).toBe("resolved");
  });

  it("does not resolve when command output does not match", async () => {
    const runDir = join(RUNS_DIR, "01RESOLVE002");
    writeRun(runDir, {
      meta: {
        schema_version: 1,
        id: "01RESOLVE002",
        task: "task-a",
        status: "completed",
        reviewed: false,
        url: "https://example.com/1",
        item_key: "https://example.com/1",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 0,
      },
      log: "done",
    });

    const resolved = await resolveRuns(RUNS_DIR, "task-a", {
      auto_resolve: true,
      resolve_command: "echo OPEN",
      resolve_when: "MERGED|CLOSED",
    });

    expect(resolved).toBe(0);
    const run = readRun(runDir);
    expect(run.meta.status).toBe("completed");
  });

  it("also resolves error runs", async () => {
    const runDir = join(RUNS_DIR, "01RESOLVE003");
    writeRun(runDir, {
      meta: {
        schema_version: 1,
        id: "01RESOLVE003",
        task: "task-a",
        status: "error",
        reviewed: false,
        url: "https://example.com/1",
        item_key: "https://example.com/1",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 1,
      },
      log: "failed",
    });

    const resolved = await resolveRuns(RUNS_DIR, "task-a", {
      auto_resolve: true,
      resolve_command: "echo CLOSED",
      resolve_when: "MERGED|CLOSED",
    });

    expect(resolved).toBe(1);
    const run = readRun(runDir);
    expect(run.meta.status).toBe("resolved");
  });

  it("skips already resolved runs", async () => {
    const runDir = join(RUNS_DIR, "01RESOLVE004");
    writeRun(runDir, {
      meta: {
        schema_version: 1,
        id: "01RESOLVE004",
        task: "task-a",
        status: "resolved",
        reviewed: false,
        url: "https://example.com/1",
        item_key: "https://example.com/1",
        started_at: "2026-03-15T10:00:00Z",
        finished_at: "2026-03-15T10:01:00Z",
        duration_seconds: 60,
        exit_code: 0,
      },
      log: "done",
    });

    const resolved = await resolveRuns(RUNS_DIR, "task-a", {
      auto_resolve: true,
      resolve_command: "echo MERGED",
      resolve_when: "MERGED|CLOSED",
    });

    expect(resolved).toBe(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/lifecycle.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/lifecycle.ts
import { execSync } from "node:child_process";
import { listRuns, updateRunMeta } from "./report.js";
import { render } from "./template.js";

export interface LifecycleConfig {
  auto_resolve: boolean;
  resolve_command: string;
  resolve_when: string;
}

export async function resolveRuns(
  runsDir: string,
  taskId: string,
  lifecycle: LifecycleConfig
): Promise<number> {
  if (!lifecycle.auto_resolve) return 0;

  const runs = listRuns(runsDir, { task: taskId });
  const resolvable = runs.filter(
    (r) => r.meta.status === "completed" || r.meta.status === "error"
  );

  const pattern = new RegExp(lifecycle.resolve_when);
  let resolvedCount = 0;

  for (const run of resolvable) {
    try {
      const itemVars: Record<string, string> = {};
      if (run.meta.url) itemVars.url = run.meta.url;
      if (run.meta.item_key) itemVars.item_key = run.meta.item_key;

      const command = render(lifecycle.resolve_command, {}, {}, itemVars);
      const output = execSync(command, {
        encoding: "utf-8",
        timeout: 15_000,
        shell: "/bin/bash",
      }).trim();

      if (pattern.test(output)) {
        updateRunMeta(run.dir, { status: "resolved" });
        resolvedCount++;
      }
    } catch {
      // If resolve command fails, skip this run — don't crash the whole lifecycle
      continue;
    }
  }

  return resolvedCount;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/lifecycle.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/lifecycle.ts src/__tests__/lifecycle.test.ts
git commit -m "feat: add lifecycle module for auto-resolving runs"
```

---

### Task 10: Crontab module

**Files:**
- Create: `src/lib/crontab.ts`
- Create: `src/__tests__/crontab.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/crontab.test.ts
import { describe, it, expect } from "vitest";
import { generateFencedBlock, replaceFencedSection } from "../lib/crontab.js";

describe("generateFencedBlock", () => {
  it("generates crontab entries for enabled tasks", () => {
    const tasks = [
      { id: "review-dependabot", name: "Review Dependabot", schedule: "*/30 * * * *" },
    ];
    const block = generateFencedBlock(tasks, "/usr/local/bin/agent247", "/home/user/agent247/runs");
    expect(block).toContain("# --- agent247 START ---");
    expect(block).toContain("# --- agent247 END ---");
    expect(block).toContain("*/30 * * * *");
    expect(block).toContain("agent247 run review-dependabot");
  });
});

describe("replaceFencedSection", () => {
  it("inserts block when no existing section", () => {
    const existing = "0 * * * * /usr/bin/backup\n";
    const block = "# --- agent247 START ---\n# test\n# --- agent247 END ---\n";
    const result = replaceFencedSection(existing, block);
    expect(result).toContain("/usr/bin/backup");
    expect(result).toContain("# --- agent247 START ---");
  });

  it("replaces existing fenced section", () => {
    const existing = `0 * * * * /usr/bin/backup
# --- agent247 START ---
# old stuff
# --- agent247 END ---
`;
    const block = "# --- agent247 START ---\n# new stuff\n# --- agent247 END ---\n";
    const result = replaceFencedSection(existing, block);
    expect(result).toContain("# new stuff");
    expect(result).not.toContain("# old stuff");
    expect(result).toContain("/usr/bin/backup");
  });

  it("preserves entries outside the fenced section", () => {
    const existing = `# user job
0 3 * * * /usr/bin/cleanup
# --- agent247 START ---
# old
# --- agent247 END ---
# another job
0 6 * * * /usr/bin/report
`;
    const block = "# --- agent247 START ---\n# updated\n# --- agent247 END ---\n";
    const result = replaceFencedSection(existing, block);
    expect(result).toContain("/usr/bin/cleanup");
    expect(result).toContain("/usr/bin/report");
    expect(result).toContain("# updated");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/crontab.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/crontab.ts
import { execSync } from "node:child_process";

const START_MARKER = "# --- agent247 START ---";
const END_MARKER = "# --- agent247 END ---";

interface CrontabTask {
  id: string;
  name: string;
  schedule: string;
}

export function generateFencedBlock(
  tasks: CrontabTask[],
  binPath: string,
  runsDir: string
): string {
  const lines = [START_MARKER];

  for (const task of tasks) {
    lines.push(`# ${task.id} (${task.name})`);
    lines.push(
      `${task.schedule} ${binPath} run ${task.id} >> ${runsDir}/cron.log 2>&1`
    );
  }

  lines.push(END_MARKER);
  return lines.join("\n") + "\n";
}

export function replaceFencedSection(
  existing: string,
  newBlock: string
): string {
  const startIdx = existing.indexOf(START_MARKER);
  const endIdx = existing.indexOf(END_MARKER);

  if (startIdx !== -1 && endIdx !== -1) {
    const before = existing.substring(0, startIdx);
    const afterStart = endIdx + END_MARKER.length;
    // Skip the trailing newline after END_MARKER if present
    const after = existing.substring(
      existing[afterStart] === "\n" ? afterStart + 1 : afterStart
    );
    return before + newBlock + after;
  }

  // No existing section — append
  const trimmed = existing.endsWith("\n") ? existing : existing + "\n";
  return trimmed + newBlock;
}

export function readCrontab(): string {
  try {
    return execSync("crontab -l", { encoding: "utf-8" });
  } catch {
    return "";
  }
}

export function writeCrontab(content: string): void {
  execSync("crontab -", { input: content, encoding: "utf-8" });
}

export function syncCrontab(
  tasks: CrontabTask[],
  binPath: string,
  runsDir: string
): void {
  const existing = readCrontab();
  const block = generateFencedBlock(tasks, binPath, runsDir);
  const updated = replaceFencedSection(existing, block);
  writeCrontab(updated);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/crontab.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/crontab.ts src/__tests__/crontab.test.ts
git commit -m "feat: add fenced crontab management"
```

---

### Task 11: Runner module

**Files:**
- Create: `src/lib/runner.ts`
- Create: `src/__tests__/runner.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/__tests__/runner.test.ts
import { describe, it, expect } from "vitest";
import { executePrompt, parseClaudeOutput } from "../lib/runner.js";

describe("parseClaudeOutput", () => {
  it("detects NO_ACTION response", () => {
    const result = parseClaudeOutput("NO_ACTION");
    expect(result.status).toBe("no-action");
    expect(result.url).toBeNull();
  });

  it("extracts URL from first line", () => {
    const result = parseClaudeOutput(
      "https://github.com/user/repo/pull/42\n\n## Review\nAll good"
    );
    expect(result.status).toBe("completed");
    expect(result.url).toBe("https://github.com/user/repo/pull/42");
    expect(result.report).toContain("## Review");
  });

  it("handles output with no URL on first line", () => {
    const result = parseClaudeOutput("## Review\nSome content");
    expect(result.status).toBe("completed");
    expect(result.url).toBeNull();
  });
});

describe("executePrompt", () => {
  it("executes a command and captures output", async () => {
    // Use echo as a mock for claude
    const result = await executePrompt("test prompt", 30, "echo");
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain("test prompt");
  });

  it("returns error for failing command", async () => {
    const result = await executePrompt("test", 30, "false");
    expect(result.exitCode).not.toBe(0);
  });
}, 10_000);
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/__tests__/runner.test.ts
```
Expected: FAIL

- [ ] **Step 3: Write implementation**

```typescript
// src/lib/runner.ts
import { spawnSync } from "node:child_process";

export interface ExecuteResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  rawJson: string | null;
  timedOut: boolean;
}

export interface ParsedOutput {
  status: "completed" | "no-action";
  url: string | null;
  report: string;
}

const URL_REGEX = /^https?:\/\/\S+$/;

export function parseClaudeOutput(output: string): ParsedOutput {
  const trimmed = output.trim();

  if (trimmed === "NO_ACTION" || trimmed.startsWith("NO_ACTION")) {
    return { status: "no-action", url: null, report: trimmed };
  }

  const lines = trimmed.split("\n");
  const firstLine = lines[0]?.trim() ?? "";
  const url = URL_REGEX.test(firstLine) ? firstLine : null;

  return {
    status: "completed",
    url,
    report: trimmed,
  };
}

export async function executePrompt(
  renderedPrompt: string,
  timeoutSeconds: number,
  command: string = "claude"
): Promise<ExecuteResult> {
  const isJson = command === "claude";
  const args =
    command === "claude"
      ? ["-p", renderedPrompt, "--output-format", "json"]
      : [renderedPrompt];

  const result = spawnSync(command, args, {
    encoding: "utf-8",
    timeout: timeoutSeconds * 1000,
    env: process.env,
    maxBuffer: 10 * 1024 * 1024, // 10MB
  });

  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    rawJson: isJson ? result.stdout : null,
    timedOut: result.signal === "SIGTERM",
  };
}

export function extractTextFromJson(rawJson: string): string {
  try {
    const parsed = JSON.parse(rawJson);
    // Claude --output-format json returns { result: "..." }
    if (typeof parsed.result === "string") return parsed.result;
    // Fallback: stringify
    return rawJson;
  } catch {
    return rawJson;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/__tests__/runner.test.ts
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/runner.ts src/__tests__/runner.test.ts
git commit -m "feat: add runner module for claude process execution"
```

---

## Chunk 2: CLI Commands

### Task 12: CLI entry point + `list` command

**Files:**
- Create: `src/cli.ts`
- Create: `src/commands/list.ts`

- [ ] **Step 1: Write list command**

```typescript
// src/commands/list.ts
import { listTasks, loadEnv } from "../lib/config.js";
import { listRuns } from "../lib/report.js";
import { join } from "node:path";

export function listCommand(baseDir: string): void {
  loadEnv(baseDir);
  const tasks = listTasks(baseDir);

  if (tasks.length === 0) {
    console.log("No tasks defined. Create a task folder under tasks/");
    return;
  }

  console.log(`\n  TASKS (${tasks.length})\n`);
  console.log(
    "  " +
      "NAME".padEnd(30) +
      "SCHEDULE".padEnd(22) +
      "ENABLED".padEnd(10) +
      "LAST RUN"
  );
  console.log("  " + "─".repeat(80));

  for (const { id, config } of tasks) {
    const runs = listRuns(join(baseDir, "runs"), { task: id });
    const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
    const lastRunTime = lastRun
      ? new Date(lastRun.meta.started_at).toLocaleString()
      : "never";

    console.log(
      "  " +
        id.padEnd(30) +
        config.schedule.padEnd(22) +
        (config.enabled ? "yes" : "no").padEnd(10) +
        lastRunTime
    );
  }
  console.log();
}
```

- [ ] **Step 2: Write CLI entry point**

```typescript
// src/cli.ts
#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { listCommand } from "./commands/list.js";

const program = new Command();

// Resolve base directory — default to project root (one level up from src/ or dist/)
const BASE_DIR =
  process.env.AGENT247_BASE_DIR ??
  resolve(import.meta.dirname ?? process.cwd(), "..");

program
  .name("agent247")
  .description("Local LLM agent task scheduler")
  .version("0.1.0");

program
  .command("list")
  .description("List all defined tasks")
  .action(() => listCommand(BASE_DIR));

program.parse();
```

- [ ] **Step 3: Test manually**

```bash
npx tsx src/cli.ts list
```
Expected: shows "No tasks defined" or lists any tasks in tasks/

- [ ] **Step 4: Commit**

```bash
git add src/cli.ts src/commands/list.ts
git commit -m "feat: add CLI entry point and list command"
```

---

### Task 13: `run` command (the core orchestrator)

**Files:**
- Create: `src/commands/run.ts`
- Create: `src/__tests__/commands/run.test.ts`

- [ ] **Step 1: Write the run command**

```typescript
// src/commands/run.ts
import { join } from "node:path";
import { ulid } from "ulid";
import { loadTaskConfig, loadGlobalVars, loadEnv } from "../lib/config.js";
import { acquireLock, releaseLock } from "../lib/lock.js";
import { resolveRuns } from "../lib/lifecycle.js";
import { discoverItems } from "../lib/discovery.js";
import { filterNewItems } from "../lib/dedup.js";
import { render } from "../lib/template.js";
import {
  executePrompt,
  parseClaudeOutput,
  extractTextFromJson,
} from "../lib/runner.js";
import { writeRun, type RunMeta } from "../lib/report.js";
import { createLogger } from "../lib/logger.js";

export async function runCommand(
  taskId: string,
  baseDir: string
): Promise<void> {
  loadEnv(baseDir);
  const runsDir = join(baseDir, "runs");
  const startedAt = new Date().toISOString();

  // Step 1: Lock
  if (!acquireLock(taskId, baseDir)) {
    console.log(`Task ${taskId} is already running, skipping.`);
    return;
  }

  try {
    const config = loadTaskConfig(taskId, baseDir);
    const globalVars = loadGlobalVars(baseDir);

    // Step 2: Lifecycle resolution
    if (config.lifecycle) {
      const resolved = await resolveRuns(runsDir, taskId, config.lifecycle);
      if (resolved > 0) {
        console.log(`Resolved ${resolved} run(s) for ${taskId}`);
      }
    }

    // Step 3: Discovery
    let items: Record<string, string>[];
    try {
      items = await discoverItems(config.discovery.command);
    } catch (err) {
      const runId = ulid();
      const runDir = join(runsDir, runId);
      const logger = createLogger(join(runDir, "log.txt"));
      logger.error(`Discovery failed: ${err}`);
      writeRun(runDir, {
        meta: {
          schema_version: 1,
          id: runId,
          task: taskId,
          status: "error",
          reviewed: false,
          url: null,
          item_key: null,
          started_at: startedAt,
          finished_at: new Date().toISOString(),
          duration_seconds: 0,
          exit_code: 1,
        },
        log: logger.getEntries().join("\n"),
      });
      console.error(`Discovery failed for ${taskId}: ${err}`);
      return;
    }

    // Step 4: Dedup
    const newItems = filterNewItems(
      runsDir,
      taskId,
      items,
      config.discovery.item_key
    );

    // Step 5: Skip if nothing to do
    if (newItems.length === 0) {
      const runId = ulid();
      const runDir = join(runsDir, runId);
      const finishedAt = new Date().toISOString();
      const logger = createLogger(join(runDir, "log.txt"));
      logger.log(
        `No new items for ${taskId} (${items.length} discovered, all deduped)`
      );
      writeRun(runDir, {
        meta: {
          schema_version: 1,
          id: runId,
          task: taskId,
          status: "skipped",
          reviewed: false,
          url: null,
          item_key: null,
          started_at: startedAt,
          finished_at: finishedAt,
          duration_seconds: Math.round(
            (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000
          ),
          exit_code: 0,
        },
        log: logger.getEntries().join("\n"),
      });
      return;
    }

    // Step 6: Execute
    if (config.prompt_mode === "per_item") {
      for (const item of newItems) {
        await executeForItem(config, globalVars, item, runsDir, startedAt);
      }
    } else {
      await executeForBatch(config, globalVars, newItems, runsDir, startedAt);
    }
  } finally {
    releaseLock(taskId, baseDir);
  }
}

async function executeForItem(
  config: ReturnType<typeof loadTaskConfig>,
  globalVars: Record<string, string>,
  item: Record<string, string>,
  runsDir: string,
  _parentStartedAt: string
): Promise<void> {
  const startedAt = new Date().toISOString();
  const runId = ulid();
  const runDir = join(runsDir, runId);
  const taskVars = config.vars ?? {};
  const renderedPrompt = render(config.prompt, globalVars, taskVars, item);

  const logger = createLogger(join(runDir, "log.txt"));
  logger.log(`Starting task: ${config.id}`);
  logger.log(`Item: ${item[config.discovery.item_key]}`);
  logger.log(`Rendered prompt (${renderedPrompt.length} chars)`);

  const execResult = await executePrompt(renderedPrompt, config.timeout);
  const finishedAt = new Date().toISOString();

  logger.log(
    `Process exited with code ${execResult.exitCode}${execResult.timedOut ? " (timed out)" : ""}`
  );

  if (execResult.exitCode !== 0) {
    logger.error(`stderr: ${execResult.stderr}`);
    writeRun(runDir, {
      meta: {
        schema_version: 1,
        id: runId,
        task: config.id,
        status: "error",
        reviewed: false,
        url: item[config.discovery.item_key] ?? null,
        item_key: item[config.discovery.item_key] ?? null,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_seconds: Math.round(
          (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000
        ),
        exit_code: execResult.exitCode,
      },
      prompt: renderedPrompt,
      log: logger.getEntries().join("\n"),
    });
    return;
  }

  const textOutput = execResult.rawJson
    ? extractTextFromJson(execResult.rawJson)
    : execResult.stdout;
  const parsed = parseClaudeOutput(textOutput);

  logger.log(`Output: ${textOutput.length} chars, status: ${parsed.status}`);

  const meta: RunMeta = {
    schema_version: 1,
    id: runId,
    task: config.id,
    status: parsed.status,
    reviewed: false,
    url: parsed.url ?? item[config.discovery.item_key] ?? null,
    item_key: item[config.discovery.item_key] ?? null,
    started_at: startedAt,
    finished_at: finishedAt,
    duration_seconds: Math.round(
      (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000
    ),
    exit_code: execResult.exitCode,
  };

  writeRun(runDir, {
    meta,
    prompt: renderedPrompt,
    rawJson: execResult.rawJson ?? undefined,
    report: parsed.report,
    log: logger.getEntries().join("\n"),
  });
}

async function executeForBatch(
  config: ReturnType<typeof loadTaskConfig>,
  globalVars: Record<string, string>,
  items: Record<string, string>[],
  runsDir: string,
  startedAt: string
): Promise<void> {
  const runId = ulid();
  const runDir = join(runsDir, runId);
  const taskVars = config.vars ?? {};

  const itemsJson = JSON.stringify(items);
  const itemsList = items
    .map((i) => `- ${i[config.discovery.item_key]}`)
    .join("\n");
  const batchVars = { items_json: itemsJson, items_list: itemsList };

  const renderedPrompt = render(
    config.prompt,
    globalVars,
    taskVars,
    batchVars
  );

  const logger = createLogger(join(runDir, "log.txt"));
  logger.log(`Starting batch task: ${config.id} (${items.length} items)`);
  logger.log(`Rendered prompt (${renderedPrompt.length} chars)`);

  const execResult = await executePrompt(renderedPrompt, config.timeout);
  const finishedAt = new Date().toISOString();

  logger.log(
    `Process exited with code ${execResult.exitCode}${execResult.timedOut ? " (timed out)" : ""}`
  );

  if (execResult.exitCode !== 0) {
    logger.error(`stderr: ${execResult.stderr}`);
    writeRun(runDir, {
      meta: {
        schema_version: 1,
        id: runId,
        task: config.id,
        status: "error",
        reviewed: false,
        url: null,
        item_key: null,
        started_at: startedAt,
        finished_at: finishedAt,
        duration_seconds: Math.round(
          (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000
        ),
        exit_code: execResult.exitCode,
      },
      prompt: renderedPrompt,
      log: logger.getEntries().join("\n"),
    });
    return;
  }

  const textOutput = execResult.rawJson
    ? extractTextFromJson(execResult.rawJson)
    : execResult.stdout;
  const parsed = parseClaudeOutput(textOutput);

  logger.log(`Output: ${textOutput.length} chars, status: ${parsed.status}`);

  writeRun(runDir, {
    meta: {
      schema_version: 1,
      id: runId,
      task: config.id,
      status: parsed.status,
      reviewed: false,
      url: parsed.url,
      item_key: null,
      started_at: startedAt,
      finished_at: finishedAt,
      duration_seconds: Math.round(
        (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000
      ),
      exit_code: execResult.exitCode,
    },
    prompt: renderedPrompt,
    rawJson: execResult.rawJson ?? undefined,
    report: parsed.report,
    log: logger.getEntries().join("\n"),
  });
}
```

- [ ] **Step 2: Register in CLI**

Add to `src/cli.ts`:
```typescript
import { runCommand } from "./commands/run.js";

program
  .command("run <task-id>")
  .description("Execute a single task")
  .action((taskId: string) => runCommand(taskId, BASE_DIR));
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/run.ts src/cli.ts
git commit -m "feat: add run command with full lifecycle orchestration"
```

---

### Task 14: `sync` command

**Files:**
- Create: `src/commands/sync.ts`

- [ ] **Step 1: Write sync command**

```typescript
// src/commands/sync.ts
import { resolve, join } from "node:path";
import { listTasks, loadEnv } from "../lib/config.js";
import { syncCrontab } from "../lib/crontab.js";

export function syncCommand(baseDir: string): void {
  loadEnv(baseDir);
  const tasks = listTasks(baseDir);
  const enabledTasks = tasks
    .filter((t) => t.config.enabled)
    .map((t) => ({
      id: t.id,
      name: t.config.name,
      schedule: t.config.schedule,
    }));

  if (enabledTasks.length === 0) {
    console.log("No enabled tasks to sync.");
    return;
  }

  // Use the path of the currently running script, which works for both npm link and direct invocation
  const binPath = process.argv[1] ?? resolve(baseDir, "dist", "cli.js");
  const runsDir = join(baseDir, "runs");

  syncCrontab(enabledTasks, binPath, runsDir);

  console.log(`Synced ${enabledTasks.length} task(s) to crontab:`);
  for (const task of enabledTasks) {
    console.log(`  ${task.id} — ${task.schedule}`);
  }
}
```

- [ ] **Step 2: Register in CLI**

Add to `src/cli.ts`:
```typescript
import { syncCommand } from "./commands/sync.js";

program
  .command("sync")
  .description("Sync task schedules to system crontab")
  .action(() => syncCommand(BASE_DIR));
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/sync.ts src/cli.ts
git commit -m "feat: add sync command for crontab management"
```

---

### Task 15: `status` command

**Files:**
- Create: `src/commands/status.ts`

- [ ] **Step 1: Write status command**

```typescript
// src/commands/status.ts
import { join } from "node:path";
import { listRuns, type RunFilter } from "../lib/report.js";

export function statusCommand(
  baseDir: string,
  options: { all?: boolean; task?: string }
): void {
  const runsDir = join(baseDir, "runs");
  const filter: RunFilter = { reviewed: false };

  if (options.task) filter.task = options.task;

  let runs = listRuns(runsDir, filter);

  if (!options.all) {
    runs = runs.filter(
      (r) => r.meta.status !== "skipped" && r.meta.status !== "no-action"
    );
  }

  if (runs.length === 0) {
    console.log("\n  No unreviewed runs.\n");
    return;
  }

  console.log(`\n  UNREVIEWED RUNS (${runs.length})\n`);
  console.log(
    "  " +
      "STATUS".padEnd(12) +
      "TASK".padEnd(28) +
      "TIME".padEnd(20) +
      "URL"
  );
  console.log("  " + "─".repeat(90));

  for (const run of runs) {
    const statusIcon =
      run.meta.status === "error" ? "✗" : run.meta.status === "completed" ? "●" : "○";
    const time = new Date(run.meta.started_at).toLocaleString();
    const url = run.meta.url ?? "—";

    console.log(
      "  " +
        `${statusIcon} ${run.meta.status}`.padEnd(12) +
        run.meta.task.padEnd(28) +
        time.padEnd(20) +
        url
    );
  }

  console.log(
    `\n  Run \`agent247 show <ulid>\` to view a report`
  );
  console.log(`  Run \`agent247 review <ulid>\` to mark as reviewed\n`);
}
```

- [ ] **Step 2: Register in CLI**

Add to `src/cli.ts`:
```typescript
import { statusCommand } from "./commands/status.js";

program
  .command("status")
  .description("Show unreviewed runs")
  .option("--all", "Include skipped and no-action runs")
  .option("--task <id>", "Filter by task ID")
  .action((options) => statusCommand(BASE_DIR, options));
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/status.ts src/cli.ts
git commit -m "feat: add status command to show unreviewed runs"
```

---

### Task 16: `show` and `review` commands

**Files:**
- Create: `src/commands/show.ts`
- Create: `src/commands/review.ts`

- [ ] **Step 1: Write show command**

```typescript
// src/commands/show.ts
import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import { readRun } from "../lib/report.js";

export function showCommand(ulid: string, baseDir: string): void {
  const runDir = join(baseDir, "runs", ulid);

  if (!existsSync(runDir)) {
    console.error(`Run not found: ${ulid}`);
    process.exit(1);
  }

  const run = readRun(runDir);

  console.log(`\n  Run: ${run.meta.id}`);
  console.log(`  Task: ${run.meta.task}`);
  console.log(`  Status: ${run.meta.status}`);
  console.log(`  Time: ${run.meta.started_at}`);
  console.log(`  Duration: ${run.meta.duration_seconds}s`);
  if (run.meta.url) console.log(`  URL: ${run.meta.url}`);
  console.log(`  Reviewed: ${run.meta.reviewed}`);
  console.log();

  if (run.report) {
    console.log("  ── Report ──────────────────────────────────\n");
    console.log(run.report);
    console.log();
  } else {
    console.log("  No report (skipped run)\n");
  }
}
```

- [ ] **Step 2: Write review command**

```typescript
// src/commands/review.ts
import { join } from "node:path";
import { existsSync } from "node:fs";
import { readRun, updateRunMeta } from "../lib/report.js";

export function reviewCommand(ulid: string, baseDir: string): void {
  const runDir = join(baseDir, "runs", ulid);

  if (!existsSync(runDir)) {
    console.error(`Run not found: ${ulid}`);
    process.exit(1);
  }

  updateRunMeta(runDir, { reviewed: true });
  const run = readRun(runDir);
  console.log(`Marked ${ulid} as reviewed (task: ${run.meta.task})`);
}
```

- [ ] **Step 3: Register both in CLI**

Add to `src/cli.ts`:
```typescript
import { showCommand } from "./commands/show.js";
import { reviewCommand } from "./commands/review.js";

program
  .command("show <ulid>")
  .description("Display a run report")
  .action((ulid: string) => showCommand(ulid, BASE_DIR));

program
  .command("review <ulid>")
  .description("Mark a run as reviewed")
  .action((ulid: string) => reviewCommand(ulid, BASE_DIR));
```

- [ ] **Step 4: Commit**

```bash
git add src/commands/show.ts src/commands/review.ts src/cli.ts
git commit -m "feat: add show and review commands"
```

---

### Task 17: `clean` command

**Files:**
- Create: `src/commands/clean.ts`

- [ ] **Step 1: Write clean command**

```typescript
// src/commands/clean.ts
import { join } from "node:path";
import { rmSync } from "node:fs";
import { listRuns, type RunMeta } from "../lib/report.js";

function parseDuration(duration: string): number {
  const match = duration.match(/^(\d+)(d|h|m)$/);
  if (!match) throw new Error(`Invalid duration: ${duration}. Use format: 7d, 24h, 30m`);

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "d": return value * 86400 * 1000;
    case "h": return value * 3600 * 1000;
    case "m": return value * 60 * 1000;
    default: throw new Error(`Unknown unit: ${unit}`);
  }
}

export function cleanCommand(
  baseDir: string,
  options: {
    olderThan: string;
    status?: RunMeta["status"];
    includeUnreviewed?: boolean;
  }
): void {
  const runsDir = join(baseDir, "runs");
  const maxAge = parseDuration(options.olderThan);
  const cutoff = Date.now() - maxAge;

  let runs = listRuns(runsDir);

  // Filter by age
  runs = runs.filter((r) => Date.parse(r.meta.started_at) < cutoff);

  // Filter by status if specified
  if (options.status) {
    runs = runs.filter((r) => r.meta.status === options.status);
  }

  // By default, only delete reviewed runs
  if (!options.includeUnreviewed) {
    runs = runs.filter((r) => r.meta.reviewed);
  }

  if (runs.length === 0) {
    console.log("No runs matching criteria to clean.");
    return;
  }

  for (const run of runs) {
    rmSync(run.dir, { recursive: true, force: true });
  }

  console.log(`Cleaned ${runs.length} run(s).`);
}
```

- [ ] **Step 2: Register in CLI**

Add to `src/cli.ts`:
```typescript
import { cleanCommand } from "./commands/clean.js";

program
  .command("clean")
  .description("Delete old runs")
  .requiredOption("--older-than <duration>", "Duration (e.g. 7d, 24h, 30m)")
  .option("--status <status>", "Only clean runs with this status")
  .option("--include-unreviewed", "Also delete unreviewed runs")
  .action((options) => cleanCommand(BASE_DIR, options));
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/clean.ts src/cli.ts
git commit -m "feat: add clean command with age and status filtering"
```

---

### Task 18: `watch` command

**Files:**
- Create: `src/commands/watch.ts`

- [ ] **Step 1: Write watch command**

```typescript
// src/commands/watch.ts
import { join } from "node:path";
import { listRuns } from "../lib/report.js";

export function watchCommand(baseDir: string): void {
  const runsDir = join(baseDir, "runs");

  const render = () => {
    // Clear screen
    process.stdout.write("\x1B[2J\x1B[H");

    const runs = listRuns(runsDir, { reviewed: false }).filter(
      (r) => r.meta.status !== "skipped"
    );

    const errors = runs.filter((r) => r.meta.status === "error").length;
    const lastRun = runs.length > 0 ? runs[runs.length - 1] : null;
    const lastRunAgo = lastRun
      ? formatAgo(Date.parse(lastRun.meta.started_at))
      : "never";

    console.log(
      `\n  agent247 — ${runs.length} unreviewed · ${errors} error · last run ${lastRunAgo}        ↻ 5s\n`
    );

    if (runs.length === 0) {
      console.log("  All caught up!\n");
      return;
    }

    console.log(
      "  " +
        "STATUS".padEnd(14) +
        "TASK".padEnd(28) +
        "TIME".padEnd(14) +
        "URL"
    );
    console.log("  " + "─".repeat(90));

    for (const run of runs) {
      const icon =
        run.meta.status === "error"
          ? "✗"
          : run.meta.status === "completed"
            ? "●"
            : "○";
      const time = new Date(run.meta.started_at).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      const url = run.meta.url ?? "—";

      console.log(
        "  " +
          `${icon} ${run.meta.status}`.padEnd(14) +
          run.meta.task.padEnd(28) +
          time.padEnd(14) +
          url
      );
    }
    console.log();
  };

  render();
  const interval = setInterval(render, 5000);

  process.on("SIGINT", () => {
    clearInterval(interval);
    process.exit(0);
  });
}

function formatAgo(timestamp: number): string {
  const diff = Math.round((Date.now() - timestamp) / 1000);
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
  return `${Math.round(diff / 86400)}d ago`;
}
```

- [ ] **Step 2: Register in CLI**

Add to `src/cli.ts`:
```typescript
import { watchCommand } from "./commands/watch.js";

program
  .command("watch")
  .description("Auto-refreshing dashboard of unreviewed runs")
  .action(() => watchCommand(BASE_DIR));
```

- [ ] **Step 3: Commit**

```bash
git add src/commands/watch.ts src/cli.ts
git commit -m "feat: add watch command with auto-refreshing dashboard"
```

---

## Chunk 3: Sample Tasks, Integration, Polish

### Task 19: Create sample tasks

**Files:**
- Create: `tasks/review-dependabot/config.yaml`
- Create: `tasks/review-dependabot/prompt.md`
- Create: `tasks/review-platform-prs/config.yaml`
- Create: `tasks/review-platform-prs/prompt.md`

- [ ] **Step 1: Write review-dependabot task**

```yaml
# tasks/review-dependabot/config.yaml
name: Review Dependabot PRs
schedule: "*/30 * * * *"
timeout: 300
enabled: true
discovery:
  command: "gh pr list --author 'dependabot[bot]' --json url,number,title,headRefName"
  item_key: url
prompt_mode: per_item
lifecycle:
  auto_resolve: true
  resolve_command: "gh pr view {{url}} --json state -q '.state'"
  resolve_when: "MERGED|CLOSED"
```

```markdown
<!-- tasks/review-dependabot/prompt.md -->
Review the following Dependabot PR: {{url}}

PR Title: {{title}}
PR Number: #{{number}}
Branch: {{headRefName}}

Analyze this dependency update and provide:
1. Summary of the dependency change (what package, from what version to what version)
2. Risk assessment:
   - Is this a major, minor, or patch version bump?
   - Are there known breaking changes?
   - Does this dependency have security advisories?
3. Recommendation: one of
   - MERGE — safe to merge as-is
   - REVIEW — needs manual review (explain why)
   - SKIP — not worth updating (explain why)

Output format:
- First line: the PR URL only
- If there are no open Dependabot PRs, respond with exactly: NO_ACTION
```

- [ ] **Step 2: Write review-platform-prs task**

```yaml
# tasks/review-platform-prs/config.yaml
name: Review Platform PRs
schedule: "0 */2 * * *"
timeout: 600
enabled: true
discovery:
  command: "gh pr list --repo noootown/platform --review-requested=@me --json url,number,title --jq '[.[] | {url, number: (.number | tostring), title}]'"
  item_key: url
prompt_mode: per_item
lifecycle:
  auto_resolve: true
  resolve_command: "gh pr view {{url}} --json state -q '.state'"
  resolve_when: "MERGED|CLOSED"
```

```markdown
<!-- tasks/review-platform-prs/prompt.md -->
You are reviewing a PR that has been assigned to me for review.

PR: {{url}}
Title: {{title}}

Please review this PR thoroughly:
1. Check out the PR diff using `gh pr diff {{url}}`
2. Understand the context and purpose of the changes
3. Identify any issues: bugs, security concerns, performance problems, code style
4. Provide a structured review report

Output format:
- First line: the PR URL only
- If there are no PRs requesting my review, respond with exactly: NO_ACTION
```

- [ ] **Step 3: Commit**

```bash
git add tasks/
git commit -m "feat: add sample tasks for dependabot and platform PR review"
```

---

### Task 20: Final CLI assembly and build verification

**Files:**
- Modify: `src/cli.ts` (ensure all imports are wired)

- [ ] **Step 1: Verify the final cli.ts has all commands registered**

Read `src/cli.ts` and ensure all 8 commands (list, run, sync, status, show, review, clean, watch) are registered. Fix any missing imports.

- [ ] **Step 2: Build the project**

```bash
npm run build
```
Expected: compiles with no errors

- [ ] **Step 3: Link globally for testing**

```bash
npm link
```

- [ ] **Step 4: Test each command**

```bash
agent247 --help
agent247 list
agent247 status
```
Expected: all commands work without errors

- [ ] **Step 5: Commit any fixes**

```bash
git add -A
git commit -m "chore: finalize CLI assembly and build"
```

---

### Task 21: Run all tests

- [ ] **Step 1: Run the full test suite**

```bash
npm test
```
Expected: all tests pass

- [ ] **Step 2: Fix any failing tests**

If any tests fail, fix the issues and re-run.

- [ ] **Step 3: Commit test fixes if any**

```bash
git add -A
git commit -m "fix: resolve test failures"
```

---

### Task 22: End-to-end manual test

- [ ] **Step 1: Create a test task for quick validation**

Create `tasks/test-echo/config.yaml`:
```yaml
name: Test Echo
schedule: "* * * * *"
timeout: 30
enabled: false
discovery:
  command: "echo '[{\"url\":\"https://example.com/test\",\"title\":\"Test Item\"}]'"
  item_key: url
prompt_mode: per_item
```

Create `tasks/test-echo/prompt.md`:
```markdown
This is a test. The item URL is: {{url}}
Title: {{title}}
Just respond with: {{url}}
```

- [ ] **Step 2: Run the test task manually**

```bash
agent247 run test-echo
```
Expected: creates a run in `runs/`

- [ ] **Step 3: Verify run artifacts**

```bash
agent247 status --all
```
Expected: shows the test run

- [ ] **Step 4: Show and review the run**

```bash
agent247 status
# Copy the ULID
agent247 show <ulid>
agent247 review <ulid>
agent247 status
```
Expected: run is now reviewed and no longer appears in status

- [ ] **Step 5: Clean up test task and commit**

```bash
rm -rf tasks/test-echo
git add -A
git commit -m "test: end-to-end validation complete"
```

---

### Task 23: Sync to crontab and final verification

- [ ] **Step 1: Sync tasks to crontab**

```bash
agent247 sync
```
Expected: shows synced tasks

- [ ] **Step 2: Verify crontab**

```bash
crontab -l
```
Expected: shows fenced agent247 section with task entries

- [ ] **Step 3: Final commit**

```bash
git add -A
git commit -m "chore: agent247 v0.1.0 ready"
```
