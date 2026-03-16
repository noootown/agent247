#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { cleanCommand } from "./commands/clean.js";
import { initCommand } from "./commands/init.js";
import { listCommand } from "./commands/list.js";
import { reviewCommand } from "./commands/review.js";
import { runCommand } from "./commands/run.js";
import { showCommand } from "./commands/show.js";
import { statusCommand } from "./commands/status.js";
import { syncCommand } from "./commands/sync.js";
import { watchCommand } from "./commands/watch.js";

const program = new Command();

function resolveBaseDir(dirOption?: string): string {
	// 1. --dir flag (highest priority)
	if (dirOption) return resolve(dirOption);

	// 2. AGENT247_BASE_DIR env var
	if (process.env.AGENT247_BASE_DIR)
		return resolve(process.env.AGENT247_BASE_DIR);

	// 3. Config file at ~/.agent247rc (stores the workspace path)
	const rcPath = join(homedir(), ".agent247rc");
	if (existsSync(rcPath)) {
		const dir = readFileSync(rcPath, "utf-8").trim();
		if (dir && existsSync(dir)) return dir;
	}

	// 4. Fallback to project root (for development)
	return resolve(import.meta.dirname ?? process.cwd(), "..");
}

program
	.name("agent247")
	.description("Local LLM agent task scheduler")
	.version("0.1.0")
	.option("--dir <path>", "Workspace directory (overrides AGENT247_BASE_DIR)");

program
	.command("init <path>")
	.description("Initialize a new workspace")
	.action((path: string) => initCommand(path));

program
	.command("list")
	.description("List all defined tasks")
	.action(() => listCommand(resolveBaseDir(program.opts().dir)));

program
	.command("run <task-id>")
	.description("Execute a single task")
	.action((taskId: string) =>
		runCommand(taskId, resolveBaseDir(program.opts().dir)),
	);

program
	.command("sync")
	.description("Sync task schedules to system crontab")
	.action(() => syncCommand(resolveBaseDir(program.opts().dir)));

program
	.command("status")
	.description("Show unreviewed runs")
	.option("--all", "Include skipped and no-action runs")
	.option("--task <id>", "Filter by task ID")
	.action((options) =>
		statusCommand(resolveBaseDir(program.opts().dir), options),
	);

program
	.command("show <ulid>")
	.description("Display a run report")
	.action((ulid: string) =>
		showCommand(ulid, resolveBaseDir(program.opts().dir)),
	);

program
	.command("review <ulid>")
	.description("Mark a run as reviewed")
	.action((ulid: string) =>
		reviewCommand(ulid, resolveBaseDir(program.opts().dir)),
	);

program
	.command("clean")
	.description("Delete old runs")
	.requiredOption("--older-than <duration>", "Duration (e.g. 7d, 24h, 30m)")
	.option("--status <status>", "Only clean runs with this status")
	.option("--include-unreviewed", "Also delete unreviewed runs")
	.action((options) =>
		cleanCommand(resolveBaseDir(program.opts().dir), options),
	);

program
	.command("watch")
	.description("Auto-refreshing dashboard of unreviewed runs")
	.action(() => watchCommand(resolveBaseDir(program.opts().dir)));

program.parse();
