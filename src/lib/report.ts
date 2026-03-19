import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface RunMeta {
	schema_version: number;
	id: string;
	task: string;
	status: "skipped" | "completed" | "error" | "processing" | "canceled";
	url: string | null;
	item_key: string | null;
	started_at: string;
	finished_at: string;
	duration_seconds: number;
	exit_code: number;
}

export interface RunData {
	meta: RunMeta;
	prompt?: string;
	rawJson?: string;
	report?: string;
	transcript?: string;
	log: string;
}

export interface RunRecord {
	meta: RunMeta;
	report?: string;
	dir: string;
}

export function writeRun(runDir: string, data: RunData): void {
	mkdirSync(runDir, { recursive: true });
	writeFileSync(join(runDir, "meta.yaml"), yaml.dump(data.meta));
	writeFileSync(join(runDir, "log.txt"), data.log);
	if (data.prompt !== undefined) {
		writeFileSync(join(runDir, "prompt.rendered.md"), data.prompt);
	}
	if (data.rawJson !== undefined) {
		let formatted = data.rawJson;
		try {
			formatted = JSON.stringify(JSON.parse(data.rawJson), null, 2);
		} catch {}
		writeFileSync(join(runDir, "raw.json"), formatted);
	}
	if (data.report !== undefined) {
		writeFileSync(join(runDir, "report.md"), data.report);
	}
	if (data.transcript) {
		writeFileSync(join(runDir, "transcript.md"), data.transcript);
	}
}

export function updateRunMeta(runDir: string, updates: Partial<RunMeta>): void {
	const metaPath = join(runDir, "meta.yaml");
	const existing = yaml.load(readFileSync(metaPath, "utf-8")) as RunMeta;
	writeFileSync(metaPath, yaml.dump({ ...existing, ...updates }));
}

export function readRun(runDir: string): RunRecord {
	const metaPath = join(runDir, "meta.yaml");
	const meta = yaml.load(readFileSync(metaPath, "utf-8")) as RunMeta;
	const reportPath = join(runDir, "report.md");
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
			(d) => d.isDirectory() && existsSync(join(taskPath, d.name, "meta.yaml")),
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

export function findRunDir(runsDir: string, runId: string): string | null {
	if (!existsSync(runsDir)) return null;
	const taskDirs = readdirSync(runsDir, { withFileTypes: true }).filter((d) =>
		d.isDirectory(),
	);
	for (const taskDir of taskDirs) {
		const candidate = join(runsDir, taskDir.name, runId);
		if (existsSync(join(candidate, "meta.yaml"))) return candidate;
	}
	return null;
}
