#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { purgeCommand } from "./commands/purge.js";
import { runCommand } from "./commands/run.js";
import { syncCommand } from "./commands/sync.js";
import { watchCommand } from "./commands/watch/index.js";

const program = new Command();

function resolveBaseDir(dirOption?: string): string {
	if (dirOption) return resolve(dirOption);

	if (process.env.AGENT247_BASE_DIR)
		return resolve(process.env.AGENT247_BASE_DIR);

	const rcPath = join(homedir(), ".agent247rc");
	if (existsSync(rcPath)) {
		const dir = readFileSync(rcPath, "utf-8").trim();
		if (dir && existsSync(dir)) return dir;
	}

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
	.command("run <task-id>")
	.description("Execute a single task")
	.action((taskId: string) =>
		runCommand(taskId, resolveBaseDir(program.opts().dir)),
	);

program
	.command("sync")
	.description("Sync task schedules to launchd")
	.action(() => syncCommand(resolveBaseDir(program.opts().dir)));

program
	.command("purge <duration>")
	.description("Delete runs older than duration (e.g. 7d, 24h, 30m)")
	.action((duration: string) =>
		purgeCommand(resolveBaseDir(program.opts().dir), duration),
	);

program
	.command("watch")
	.description("Interactive run dashboard")
	.option("-a, --all", "Include skipped runs")
	.action((options) =>
		watchCommand(resolveBaseDir(program.opts().dir), options),
	);

program.parse();
