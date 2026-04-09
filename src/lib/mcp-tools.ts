import { spawn } from "node:child_process";
import { join } from "node:path";
import { ulid } from "ulid";
import { listTasks as listTaskConfigs } from "./config.js";
import { listRuns } from "./report.js";

export interface TaskSummary {
	task_id: string;
	name: string;
	description: string | undefined;
	cron_enabled: boolean;
	schedule: string;
}

export interface RunResult {
	run_id: string;
	task_id: string;
	status: string;
	url?: string | null;
	item_key?: string | null;
	report?: string;
	duration_seconds?: number;
}

export interface RunTaskResult {
	run_id: string;
	task_id: string;
	status: "processing";
}

export function listMcpTasks(baseDir: string): TaskSummary[] {
	return listTaskConfigs(baseDir).map(({ id, config }) => ({
		task_id: id,
		name: config.name,
		description: config.description,
		cron_enabled: config.cron_enabled,
		schedule: config.schedule,
	}));
}

export function checkRun(baseDir: string, runId: string): RunResult | null {
	const runsDir = join(baseDir, "runs");
	const allRuns = listRuns(runsDir);
	const run = allRuns.find((r) => r.meta.id === runId);
	if (!run) return null;

	if (run.meta.status === "processing") {
		return {
			run_id: run.meta.id,
			task_id: run.meta.task,
			status: "processing",
		};
	}

	return {
		run_id: run.meta.id,
		task_id: run.meta.task,
		status: run.meta.status,
		url: run.meta.url,
		item_key: run.meta.item_key,
		report: run.report,
		duration_seconds: run.meta.duration_seconds,
	};
}

export function runTask(
	baseDir: string,
	taskId: string,
	vars?: Record<string, string>,
): RunTaskResult {
	// Validate task exists
	const tasks = listTaskConfigs(baseDir);
	const task = tasks.find((t) => t.id === taskId);
	if (!task) {
		throw new Error(`Task not found: ${taskId}`);
	}

	const runId = ulid();
	const cliPath = join(import.meta.dirname, "..", "cli.js");
	const args = [cliPath, "--dir", baseDir, "run", taskId];
	if (vars && Object.keys(vars).length > 0) {
		args.push("--vars", JSON.stringify(vars));
	}
	args.push("--run-id", runId);

	const child = spawn(process.execPath, args, {
		detached: true,
		stdio: "ignore",
		env: process.env,
	});
	child.unref();

	return {
		run_id: runId,
		task_id: taskId,
		status: "processing",
	};
}
