import { actionSoftDelete } from "../actions.js";
import type { State, VisibleLine, WatchContext } from "../state.js";

export function handleKey(
	key: string,
	state: State,
	lines: VisibleLine[],
	ctx: WatchContext,
): State {
	if (key === "\x1B[D" || key === "\x1B[C") {
		return {
			...state,
			confirmChoice: state.confirmChoice === "yes" ? "no" : "yes",
		};
	}
	if (key === "\r") {
		if (state.mode === "confirm-delete") {
			if (state.confirmChoice === "yes") {
				// Delete all selected runs (reverse order to preserve indices)
				const indices = [...state.selected].sort((a, b) => b - a);
				let next: State = {
					...state,
					mode: "split",
					selected: new Set<number>(),
				};
				for (const idx of indices) {
					const line = lines[idx];
					if (line?.type === "run") next = actionSoftDelete(next, line, ctx);
				}
				return { ...next, mode: "split" as const };
			}
			return { ...state, mode: "split" as const, selected: new Set<number>() };
		}
		const taskId = state.confirmTask;
		const next = { ...state, mode: "split" as const, confirmTask: null };
		if (state.confirmChoice === "yes" && taskId) {
			if (state.mode === "confirm-run") {
				ctx.spawnRun(taskId);
			} else if (state.mode === "confirm-stop") {
				ctx.stopTask(taskId);
				return ctx.reload(next);
			}
		}
		return next;
	}
	if (key === "q" || key === "\x1B") {
		return {
			...state,
			mode: "split" as const,
			confirmTask: null,
			selected: new Set<number>(),
		};
	}
	return state;
}
