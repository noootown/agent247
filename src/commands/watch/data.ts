import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { listTasks } from "../../lib/config.js";
import { getAgentSchedules, listInstalledAgents } from "../../lib/launchd.js";
import { listRuns, type RunRecord } from "../../lib/report.js";
import { readTaskCache } from "../../lib/task-cache.js";
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
): State {
	const runs = listRuns(runsDir);
	runs.sort((a, b) => b.meta.id.localeCompare(a.meta.id));

	const taskMap = new Map<string, RunRecord[]>();
	const taskConfigs = listTasks(baseDir);
	const configMap = new Map(taskConfigs.map((t) => [t.id, t.config]));
	const installedAgents = new Set(listInstalledAgents());
	const schedules = getAgentSchedules();

	// Read last check timestamp from per-task cache files
	const lastCheckMap = new Map<string, string>();
	for (const t of taskConfigs) {
		const cache = readTaskCache(runsDir, t.id);
		if (cache?.last_check) {
			lastCheckMap.set(t.id, cache.last_check);
		}
	}

	for (const t of taskConfigs) {
		taskMap.set(t.id, []);
	}
	for (const run of runs) {
		const existing = taskMap.get(run.meta.task) ?? [];
		existing.push(run);
		taskMap.set(run.meta.task, existing);
	}

	const isFirstLoad = currentState.groups.length === 0;
	const prevExpanded = new Set(
		currentState.groups.filter((g) => g.expanded).map((g) => g.task),
	);

	const groups: TaskGroup[] = [...taskMap.entries()]
		.map(([task, taskRuns]) => ({
			task,
			config: configMap.get(task) ?? {
				id: task,
				name: task,
				schedule: "",
				timeout: 0,
				enabled: false,
				discovery: { command: "", item_key: "" },
				model: "",
				prompt: "",
			},
			runs: taskRuns,
			expanded: isFirstLoad ? false : prevExpanded.has(task),
			running:
				isTaskRunning(baseDir, task) ||
				taskRuns.some((r) => r.meta.status === "processing"),
			enabled: installedAgents.has(task),
			schedule: schedules.get(task) ?? null,
			lastCheck: lastCheckMap.get(task) ?? null,
		}))
		.sort((a, b) => {
			if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
			return a.task.localeCompare(b.task);
		});

	const newState = { ...currentState, groups };

	// On first load, position cursor on the latest run
	if (isFirstLoad) {
		let latestRun: RunRecord | null = null;
		for (const g of groups) {
			if (
				g.runs.length > 0 &&
				(!latestRun || g.runs[0].meta.id > latestRun.meta.id)
			) {
				latestRun = g.runs[0];
			}
		}
		if (latestRun) {
			const visibleLines = getVisibleLines(newState);
			const idx = visibleLines.findIndex(
				(l) => l.type === "run" && l.run.meta.id === latestRun?.meta.id,
			);
			if (idx >= 0) {
				newState.cursor = idx;
				newState.splitRun = latestRun;
			}
		}
	}

	return newState;
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
