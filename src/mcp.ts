#!/usr/bin/env node
import { resolve } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { checkRun, listMcpTasks, runTask } from "./lib/mcp-tools.js";

function resolveBaseDir(): string {
	const dir = process.env.AGENT247_WORKSPACE_PATH;
	if (!dir) {
		throw new Error("AGENT247_WORKSPACE_PATH environment variable is required");
	}
	return resolve(dir);
}

const baseDir = resolveBaseDir();

const server = new McpServer({
	name: "agent247",
	version: "0.1.0",
});

server.tool(
	"list_tasks",
	"List all available agent247 tasks with their descriptions and schedules",
	{},
	async () => {
		const tasks = listMcpTasks(baseDir);
		return {
			content: [{ type: "text", text: JSON.stringify(tasks, null, 2) }],
		};
	},
);

server.tool(
	"run_task",
	"Run an agent247 task. Returns immediately with a run_id for tracking. Use check_run to poll for results.",
	{
		task_id: z
			.string()
			.describe(
				"The task identifier (e.g., 'ticket-implement', 'pr-resolve-coderabbit')",
			),
		vars: z
			.record(z.string(), z.string())
			.optional()
			.describe(
				"Variables to pass to the task. Merged with discovery results and template defaults.",
			),
	},
	async ({ task_id, vars }) => {
		try {
			const result = runTask(baseDir, task_id, vars);
			return {
				content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
			};
		} catch (err) {
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{
								error: err instanceof Error ? err.message : String(err),
							},
							null,
							2,
						),
					},
				],
				isError: true,
			};
		}
	},
);

server.tool(
	"check_run",
	"Check the status and result of a previous run_task invocation",
	{
		run_id: z.string().describe("The run ID returned by run_task"),
	},
	async ({ run_id }) => {
		const result = checkRun(baseDir, run_id);
		if (!result) {
			return {
				content: [
					{
						type: "text",
						text: JSON.stringify(
							{ error: `Run not found: ${run_id}` },
							null,
							2,
						),
					},
				],
				isError: true,
			};
		}
		return {
			content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
		};
	},
);

async function main() {
	const transport = new StdioServerTransport();
	await server.connect(transport);
}

main().catch((err) => {
	console.error("MCP server failed:", err);
	process.exit(1);
});
