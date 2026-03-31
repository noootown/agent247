import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { FILE } from "./constants.js";
import { redact } from "./redact.js";

export type RunStatus = "completed" | "error" | "processing" | "canceled";

export interface RunMeta {
	schema_version: number;
	id: string;
	task: string;
	status: RunStatus;
	url: string | null;
	item_key: string | null;
	started_at: string;
	finished_at: string;
	duration_seconds: number;
	exit_code: number;
	marked?: boolean;
}

export interface RunData {
	meta: RunMeta;
	config?: Record<string, unknown>;
	vars?: Record<string, unknown>;
	discovery?: Record<string, string>[];
	result?: unknown;
	prompt?: string;
	report?: string;
	transcript?: string;
	log: string;
	secrets?: Map<string, string>;
}

export interface RunRecord {
	meta: RunMeta;
	report?: string;
	dir: string;
}

export function writeRun(runDir: string, data: RunData): void {
	mkdirSync(runDir, { recursive: true });
	const secrets = data.secrets;
	const r = secrets ? (s: string) => redact(s, secrets) : (s: string) => s;

	// Build data.json with all structured data
	const dataJson: Record<string, unknown> = { run: data.meta };
	if (data.config) dataJson.config = data.config;
	if (data.vars) dataJson.vars = data.vars;
	if (data.discovery) dataJson.discovery = data.discovery;
	if (data.result !== undefined) dataJson.result = data.result;
	writeFileSync(join(runDir, FILE.DATA), r(JSON.stringify(dataJson, null, 2)));

	// Write text files
	writeFileSync(join(runDir, FILE.LOG), r(data.log));
	if (data.prompt !== undefined) {
		writeFileSync(join(runDir, FILE.PROMPT), r(data.prompt));
	}
	if (data.report !== undefined) {
		writeFileSync(join(runDir, FILE.REPORT), r(data.report));
	}
	if (data.transcript) {
		writeFileSync(join(runDir, FILE.TRANSCRIPT), r(data.transcript));
	}
}

export function updateRunMeta(runDir: string, updates: Partial<RunMeta>): void {
	const dataPath = join(runDir, FILE.DATA);
	const data = JSON.parse(readFileSync(dataPath, "utf-8"));
	data.run = { ...data.run, ...updates };
	writeFileSync(dataPath, JSON.stringify(data, null, 2));
}

export function readRun(runDir: string): RunRecord {
	const dataPath = join(runDir, FILE.DATA);
	const data = JSON.parse(readFileSync(dataPath, "utf-8"));
	const meta = data.run as RunMeta;
	const reportPath = join(runDir, FILE.REPORT);
	const report = existsSync(reportPath)
		? readFileSync(reportPath, "utf-8")
		: undefined;
	return { meta, report, dir: runDir };
}

export interface RunFilter {
	task?: string;
	status?: RunMeta["status"];
}

export function listRuns(runsDir: string, filter?: RunFilter): RunRecord[] {
	if (!existsSync(runsDir)) return [];
	const taskDirs = readdirSync(runsDir, { withFileTypes: true }).filter((d) =>
		d.isDirectory(),
	);
	const allRunDirs: string[] = [];
	for (const taskDir of taskDirs) {
		const taskPath = join(runsDir, taskDir.name);
		const runEntries = readdirSync(taskPath, { withFileTypes: true }).filter(
			(d) => d.isDirectory() && existsSync(join(taskPath, d.name, FILE.DATA)),
		);
		for (const runEntry of runEntries) {
			allRunDirs.push(join(taskPath, runEntry.name));
		}
	}
	let runs = allRunDirs.map((dir) => readRun(dir));
	if (filter?.task) runs = runs.filter((r) => r.meta.task === filter.task);
	if (filter?.status)
		runs = runs.filter((r) => r.meta.status === filter.status);
	runs.sort((a, b) => a.meta.id.localeCompare(b.meta.id));
	return runs;
}
