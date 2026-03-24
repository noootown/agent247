import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FILE } from "../../lib/constants.js";
import type { State, VisibleLine, WatchContext } from "./state.js";

export function actionSoftDelete(
	state: State,
	line: VisibleLine,
	ctx: WatchContext,
): State {
	if (line.type !== "run" || line.run.meta.status === "processing")
		return state;
	ctx.softDelete(line.run.dir);
	let next = ctx.reload(state);
	const visibleCount = next.groups.reduce(
		(sum, g) => sum + 1 + (g.expanded ? g.runs.length : 0),
		0,
	);
	if (next.cursor >= visibleCount) {
		next = { ...next, cursor: Math.max(0, visibleCount - 1) };
	}
	return next;
}

export function actionOpenUrl(
	state: State,
	line: VisibleLine,
	ctx: WatchContext,
): State {
	const url = line.type === "run" ? line.run.meta.url : null;
	if (url?.startsWith("http")) ctx.openUrl(url);
	return state;
}

export function actionRun(state: State, line: VisibleLine): State {
	if (line.type !== "group") return state;
	return {
		...state,
		mode: "confirm-run",
		confirmTask: line.group.task,
		confirmChoice: "yes",
	};
}

export function actionStop(state: State, line: VisibleLine): State {
	if (line.type !== "group" || !line.group.running) return state;
	return {
		...state,
		mode: "confirm-stop",
		confirmTask: line.group.task,
		confirmChoice: "yes",
	};
}

export function actionShell(state: State, line: VisibleLine): State {
	if (line.type !== "run") return state;
	const status = line.run.meta.status;
	if (status !== "completed" && status !== "error" && status !== "canceled")
		return state;

	// Read cwd from the run's data.json config section
	const dataPath = join(line.run.dir, FILE.DATA);
	if (!existsSync(dataPath)) return state;
	try {
		const data = JSON.parse(readFileSync(dataPath, "utf-8"));
		const cwd = data.config?.cwd;
		if (!cwd || !existsSync(cwd)) return state;
		return { ...state, shellCwd: cwd };
	} catch {
		return state;
	}
}

export function actionToggle(
	state: State,
	line: VisibleLine,
	ctx: WatchContext,
): State {
	if (line.type !== "group") return state;
	ctx.toggleTask(line.group.task);
	return ctx.reload(state);
}
