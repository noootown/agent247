import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { FILE } from "./constants.js";

export interface TaskConfig {
	id: string;
	name: string;
	description?: string;
	schedule: string;
	timeout: number;
	cron_enabled: boolean;
	vars?: Record<string, string>;
	discovery?: {
		command: string;
		item_key: string;
	};
	model: string;
	cwd?: string;
	bypass_dedup?: boolean;
	parallel?: boolean;
	parallel_group_by?: string;
	requires_network?: boolean;
	pre_run?: string;
	post_run?: string;
	auto_mark?: boolean;
	url_template?: string;
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
	const configPath = join(taskDir, FILE.CONFIG);
	const promptPath = join(taskDir, FILE.PROMPT_SRC);

	const raw = yaml.load(readFileSync(configPath, "utf-8")) as Record<
		string,
		unknown
	>;
	if (!raw || typeof raw !== "object") {
		throw new Error(
			`Invalid config for task ${taskId}: empty or not an object`,
		);
	}
	for (const field of ["name", "schedule", "timeout"]) {
		if (!(field in raw)) {
			throw new Error(`Task ${taskId} config missing required field: ${field}`);
		}
	}
	if (!("cron_enabled" in raw)) {
		throw new Error(
			`Task ${taskId} config missing required field: cron_enabled`,
		);
	}
	const prompt = readFileSync(promptPath, "utf-8");

	return {
		id: taskId,
		name: raw.name as string,
		description: raw.description as string | undefined,
		schedule: raw.schedule as string,
		timeout: raw.timeout as number,
		cron_enabled: raw.cron_enabled as boolean,
		vars: raw.vars as Record<string, string> | undefined,
		discovery: raw.discovery as
			| { command: string; item_key: string }
			| undefined,
		model: (raw.model as string) ?? "sonnet",
		cwd: raw.cwd as string | undefined,
		bypass_dedup: (raw.bypass_dedup as boolean) ?? false,
		parallel: (raw.parallel as boolean) ?? false,
		parallel_group_by: raw.parallel_group_by as string | undefined,
		requires_network: (raw.requires_network as boolean) ?? false,
		pre_run: raw.pre_run as string | undefined,
		post_run: raw.post_run as string | undefined,
		auto_mark: (raw.auto_mark as boolean) ?? false,
		url_template: raw.url_template as string | undefined,
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
		.filter((d) => existsSync(join(tasksDir, d.name, FILE.CONFIG)))
		.map((d) => ({
			id: d.name,
			config: loadTaskConfig(d.name, baseDir),
		}));
}

interface QuietWindow {
	start: string; // "HH:MM"
	end: string; // "HH:MM"
}

interface QuietHoursConfig {
	enabled?: boolean;
	windows?: QuietWindow[];
}

function parseHHMM(time: string): number | null {
	const match = /^(\d{1,2}):(\d{2})$/.exec(time);
	if (!match) return null;
	const h = Number(match[1]);
	const m = Number(match[2]);
	if (h < 0 || h > 23 || m < 0 || m > 59) return null;
	return h * 60 + m;
}

export function isQuietHours(baseDir: string, now?: Date): boolean {
	const settingsPath = join(baseDir, "settings.yaml");
	if (!existsSync(settingsPath)) return false;

	const raw = yaml.load(readFileSync(settingsPath, "utf-8")) as Record<
		string,
		unknown
	> | null;
	if (!raw) return false;

	const qh = raw.quiet_hours as QuietHoursConfig | undefined;
	if (!qh?.enabled || !qh.windows?.length) return false;

	const d = now ?? new Date();
	const current = d.getHours() * 60 + d.getMinutes();

	for (const w of qh.windows) {
		const start = parseHHMM(w.start);
		const end = parseHHMM(w.end);
		if (start === null || end === null) continue;

		if (start < end) {
			// Normal window: e.g., 01:00–06:00
			if (current >= start && current < end) return true;
		} else {
			// Midnight-wrapping: e.g., 23:00–03:00
			if (current >= start || current < end) return true;
		}
	}

	return false;
}
