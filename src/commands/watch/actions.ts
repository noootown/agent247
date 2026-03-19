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

export function actionStop(
	state: State,
	line: VisibleLine,
	ctx: WatchContext,
): State {
	if (line.type !== "group" || !line.group.running) return state;
	ctx.stopTask(line.group.task);
	return ctx.reload(state);
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
