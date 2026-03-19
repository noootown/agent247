import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

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
	model: string;
	prompt_mode: "per_item" | "batch";
	cwd?: string;
	allow_rerun?: boolean;
	cleanup?: {
		command: string;
		when: string;
		retain?: string; // e.g. "12h", "7d", "30m" — keep runs for this long before cleanup
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
		throw new Error(
			`Invalid config for task ${taskId}: empty or not an object`,
		);
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
		model: (raw.model as string) ?? "sonnet",
		prompt_mode: (raw.prompt_mode as string) === "batch" ? "batch" : "per_item",
		cwd: raw.cwd as string | undefined,
		allow_rerun: (raw.allow_rerun as boolean) ?? false,
		cleanup: raw.cleanup as TaskConfig["cleanup"],
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

export function listTasks(
	baseDir: string,
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
