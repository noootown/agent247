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
	discovery?: {
		command: string;
		item_key: string;
	};
	model: string;
	prompt_mode: "per_item" | "batch";
	cwd?: string;
	bypass_dedup?: boolean;
	parallel?: boolean;
	pre_run?: string;
	post_run?: string;
	cleanup?: {
		check?: string;
		when?: string;
		retain?: string; // e.g. "12h", "7d", "30m" — keep runs for this long before cleanup
		teardown?: string;
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
	for (const field of ["name", "schedule", "timeout", "enabled"]) {
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
		discovery: raw.discovery as
			| { command: string; item_key: string }
			| undefined,
		model: (raw.model as string) ?? "sonnet",
		prompt_mode: (raw.prompt_mode as string) === "batch" ? "batch" : "per_item",
		cwd: raw.cwd as string | undefined,
		bypass_dedup: (raw.bypass_dedup as boolean) ?? false,
		parallel: (raw.parallel as boolean) ?? false,
		pre_run: raw.pre_run as string | undefined,
		post_run: raw.post_run as string | undefined,
		cleanup: raw.cleanup
			? (() => {
					const c = raw.cleanup as Record<string, unknown>;
					return {
						check: (c.check as string) ?? (c.command as string),
						when: c.when as string,
						retain: c.retain as string | undefined,
						teardown: c.teardown as string | undefined,
					};
				})()
			: undefined,
		prompt,
	};
}

/** Parse .env.local and return raw key-value pairs (does NOT set process.env). */
export function loadEnvLocalRaw(baseDir: string): Record<string, string> {
	const envPath = join(baseDir, ".env.local");
	if (!existsSync(envPath)) return {};
	const content = readFileSync(envPath, "utf-8");
	const entries: Record<string, string> = {};
	for (const line of content.split("\n")) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eqIdx = trimmed.indexOf("=");
		if (eqIdx === -1) continue;
		const key = trimmed.slice(0, eqIdx).trim();
		let value = trimmed.slice(eqIdx + 1).trim();
		if (
			(value.startsWith('"') && value.endsWith('"')) ||
			(value.startsWith("'") && value.endsWith("'"))
		) {
			value = value.slice(1, -1);
		}
		entries[key] = value;
	}
	return entries;
}

function loadEnvLocal(baseDir: string): void {
	const entries = loadEnvLocalRaw(baseDir);
	for (const [key, value] of Object.entries(entries)) {
		process.env[key] = value;
	}
}

function resolveEnvVars(vars: Record<string, string>): Record<string, string> {
	const resolved: Record<string, string> = {};
	for (const [key, value] of Object.entries(vars)) {
		if (typeof value !== "string") {
			resolved[key] = value;
			continue;
		}
		resolved[key] = value.replace(
			/\{\{([A-Z_][A-Z0-9_]*)\}\}/g,
			(match, envKey) => {
				return process.env[envKey] ?? match;
			},
		);
	}
	return resolved;
}

export function loadGlobalVars(baseDir: string): Record<string, string> {
	loadEnvLocal(baseDir);
	const varsPath = join(baseDir, "vars.yaml");
	if (!existsSync(varsPath)) return {};
	const raw = yaml.load(readFileSync(varsPath, "utf-8")) as Record<
		string,
		string
	>;
	if (!raw) return {};
	return resolveEnvVars(raw);
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
