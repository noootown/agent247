#!/usr/bin/env node
import { resolve } from "node:path";
import { Command } from "commander";
import { initCommand } from "./commands/init.js";
import { purgeCommand } from "./commands/purge.js";
import { runCommand } from "./commands/run.js";
import { syncCommand } from "./commands/sync.js";
import { watchCommand } from "./commands/watch/index.js";

const program = new Command();

function resolveBaseDir(dirOption?: string): string {
	if (dirOption) return resolve(dirOption);

	if (process.env.AGENT247_WORKSPACE_PATH)
		return resolve(process.env.AGENT247_WORKSPACE_PATH);

	return resolve(import.meta.dirname ?? process.cwd(), "..");
}

program
	.name("agent247")
	.description("Local LLM agent task scheduler")
	.version("0.1.0")
	.option(
		"--dir <path>",
		"Workspace directory (overrides AGENT247_WORKSPACE_PATH)",
	);

program
	.command("init <path>")
	.description("Initialize a new workspace")
	.action((path: string) => initCommand(path));

program
	.command("run <task-id>")
	.description("Execute a single task")
	.option("--rerun <item-key>", "Rerun a specific item (bypasses dedup)")
	.option("--cron", "Invoked by cron (adds random jitter)")
	.option("--vars <json>", "JSON object of variables to pass as item vars")
	.option(
		"--run-id <id>",
		"Use a specific run ID (for MCP server coordination)",
	)
	.action(
		(
			taskId: string,
			opts: {
				rerun?: string;
				cron?: boolean;
				vars?: string;
				runId?: string;
			},
		) => {
			const vars = opts.vars ? JSON.parse(opts.vars) : undefined;
			runCommand(
				taskId,
				resolveBaseDir(program.opts().dir),
				opts.rerun,
				opts.cron,
				vars,
				opts.runId,
			);
		},
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
	.action(() => watchCommand(resolveBaseDir(program.opts().dir)));

program
	.command("mcp")
	.description("Start MCP server (stdio transport)")
	.action(async () => {
		await import("./mcp.js");
	});

program.parse();
