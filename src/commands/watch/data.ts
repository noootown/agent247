import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listTasks } from "../../lib/config.js";
import { readCrontab } from "../../lib/crontab.js";
import { listRuns, type RunRecord } from "../../lib/report.js";
import type { State, TaskGroup, VisibleLine } from "./state.js";

export function getTaskPid(baseDir: string, taskId: string): number | null {
	const lockPath = join(baseDir, "tasks", taskId, ".lock");
	if (!existsSync(lockPath)) return null;
	try {
		const pid = Number.parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
		if (Number.isNaN(pid)) return null;
		process.kill(pid, 0);
		return pid;
	} catch {
		return null;
	}
}

export function isTaskRunning(baseDir: string, taskId: string): boolean {
	return getTaskPid(baseDir, taskId) !== null;
}

export function loadData(
	baseDir: string,
	runsDir: string,
	currentState: State,
	options?: { all?: boolean },
): State {
	let runs = listRuns(runsDir);
	if (!options?.all) {
		runs = runs.filter((r) => r.meta.status !== "skipped");
	}
	runs.sort((a, b) => b.meta.id.localeCompare(a.meta.id));

	const taskMap = new Map<string, RunRecord[]>();
	const taskConfigs = listTasks(baseDir);
	const crontab = readCrontab();
	const enabledMap = new Map<string, boolean>();
	for (const t of taskConfigs) {
		taskMap.set(t.id, []);
		enabledMap.set(t.id, crontab.includes(`run ${t.id}`));
	}
	for (const run of runs) {
		const existing = taskMap.get(run.meta.task) ?? [];
		existing.push(run);
		taskMap.set(run.meta.task, existing);
	}

	const prevExpanded = new Set(
		currentState.groups.filter((g) => g.expanded).map((g) => g.task),
	);

	const groups: TaskGroup[] = [...taskMap.entries()]
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([task, taskRuns]) => ({
			task,
			runs: taskRuns,
			expanded: prevExpanded.has(task),
			running: isTaskRunning(baseDir, task),
			enabled: enabledMap.get(task) ?? true,
		}));

	return { ...currentState, groups };
}

export function getVisibleLines(state: State): VisibleLine[] {
	const lines: VisibleLine[] = [];
	let idx = 0;
	for (const group of state.groups) {
		lines.push({ type: "group", group, index: idx++ });
		if (group.expanded) {
			for (const run of group.runs) {
				lines.push({ type: "run", run, group, index: idx++ });
			}
		}
	}
	return lines;
}
