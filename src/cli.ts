#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "node:path";
import { listCommand } from "./commands/list.js";
import { runCommand } from "./commands/run.js";
import { syncCommand } from "./commands/sync.js";
import { statusCommand } from "./commands/status.js";
import { showCommand } from "./commands/show.js";
import { reviewCommand } from "./commands/review.js";
import { cleanCommand } from "./commands/clean.js";
import { watchCommand } from "./commands/watch.js";

const program = new Command();

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

program
  .command("run <task-id>")
  .description("Execute a single task")
  .action((taskId: string) => runCommand(taskId, BASE_DIR));

program
  .command("sync")
  .description("Sync task schedules to system crontab")
  .action(() => syncCommand(BASE_DIR));

program
  .command("status")
  .description("Show unreviewed runs")
  .option("--all", "Include skipped and no-action runs")
  .option("--task <id>", "Filter by task ID")
  .action((options) => statusCommand(BASE_DIR, options));

program
  .command("show <ulid>")
  .description("Display a run report")
  .action((ulid: string) => showCommand(ulid, BASE_DIR));

program
  .command("review <ulid>")
  .description("Mark a run as reviewed")
  .action((ulid: string) => reviewCommand(ulid, BASE_DIR));

program
  .command("clean")
  .description("Delete old runs")
  .requiredOption("--older-than <duration>", "Duration (e.g. 7d, 24h, 30m)")
  .option("--status <status>", "Only clean runs with this status")
  .option("--include-unreviewed", "Also delete unreviewed runs")
  .action((options) => cleanCommand(BASE_DIR, options));

program
  .command("watch")
  .description("Auto-refreshing dashboard of unreviewed runs")
  .action(() => watchCommand(BASE_DIR));

program.parse();
