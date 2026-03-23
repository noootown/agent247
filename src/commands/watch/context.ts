import { execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { archiveRun } from "../../lib/cleanup.js";
import { loadTaskConfig } from "../../lib/config.js";
import { listRuns, updateRunMeta } from "../../lib/report.js";
import { render as renderTemplate } from "../../lib/template.js";
import { syncCommand } from "../sync.js";

export function makeSoftDelete(
	baseDir: string,
	binDir: string,
	globalVars: Record<string, string>,
): (runDir: string) => void {
	return (runDir: string) => {
		const parts = runDir.split("/");
		const task = parts[parts.length - 2];
		let taskConfig: ReturnType<typeof loadTaskConfig> | null = null;
		try {
			taskConfig = loadTaskConfig(task, baseDir);
		} catch {}
		let itemVars: Record<string, string> = {};
		try {
			const itemPath = join(runDir, "vars.json");
			if (existsSync(itemPath)) {
				itemVars = JSON.parse(readFileSync(itemPath, "utf-8"));
			}
		} catch {}
		archiveRun(
			runDir,
			binDir,
			task,
			taskConfig?.cleanup?.teardown,
			globalVars,
			taskConfig?.vars ?? {},
			itemVars,
			baseDir,
		);
	};
}

export function makeStopTask(
	baseDir: string,
	runsDir: string,
	globalVars: Record<string, string>,
): (taskId: string) => void {
	return (taskId: string) => {
		const lockPath = join(baseDir, "tasks", taskId, ".lock");
		try {
			const pid = Number.parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
			if (!Number.isNaN(pid)) {
				try {
					process.kill(-pid, "SIGTERM");
				} catch {
					try {
						process.kill(pid, "SIGTERM");
					} catch {}
				}
			}
		} catch {}
		const runs = listRuns(runsDir, { task: taskId });
		let taskConfig: ReturnType<typeof loadTaskConfig> | null = null;
		try {
			taskConfig = loadTaskConfig(taskId, baseDir);
		} catch {}
		for (const run of runs) {
			if (run.meta.status === "processing") {
				updateRunMeta(run.dir, { status: "canceled" });
				if (taskConfig?.post_run) {
					try {
						const itemPath = join(run.dir, "vars.json");
						const itemVars = existsSync(itemPath)
							? JSON.parse(readFileSync(itemPath, "utf-8"))
							: {};
						const cmd = renderTemplate(
							taskConfig.post_run,
							globalVars,
							taskConfig.vars ?? {},
							itemVars,
						);
						execSync(cmd, {
							encoding: "utf-8",
							timeout: 60_000,
							shell: "/bin/bash",
							stdio: "pipe",
							cwd: baseDir,
						});
					} catch {}
				}
			}
		}
		try {
			unlinkSync(lockPath);
		} catch {}
	};
}

export function makeToggleTask(baseDir: string): (taskId: string) => void {
	return (taskId: string) => {
		const configPath = join(baseDir, "tasks", taskId, "config.yaml");
		if (!existsSync(configPath)) return;
		const raw = yaml.load(readFileSync(configPath, "utf-8")) as Record<
			string,
			unknown
		>;
		raw.enabled = !raw.enabled;
		writeFileSync(configPath, yaml.dump(raw));
		try {
			syncCommand(baseDir);
		} catch {}
	};
}

export function makeSpawnRun(baseDir: string): (taskId: string) => void {
	return (taskId: string) => {
		const cliEntry = process.argv.find(
			(a) => a.endsWith("cli.ts") || a.endsWith("cli.js"),
		);
		const child = cliEntry
			? spawn("npx", ["tsx", cliEntry, "run", taskId], {
					env: { ...process.env, AGENT247_BASE_DIR: baseDir },
					stdio: "ignore",
					shell: true,
				})
			: spawn("agent247", ["run", taskId], {
					env: { ...process.env, AGENT247_BASE_DIR: baseDir },
					stdio: "ignore",
					shell: true,
				});
		child.on("error", () => {});
	};
}
