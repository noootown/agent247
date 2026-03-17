import type { State, VisibleLine, WatchContext } from "../state.js";

export function handleKey(
	key: string,
	state: State,
	_lines: VisibleLine[],
	ctx: WatchContext,
): State {
	if (key === "\x1B[D" || key === "\x1B[C") {
		return {
			...state,
			confirmChoice: state.confirmChoice === "yes" ? "no" : "yes",
		};
	}
	if (key === "\r") {
		const taskId = state.confirmTask;
		const next = { ...state, mode: "list" as const, confirmTask: null };
		if (state.confirmChoice === "yes" && taskId) {
			ctx.spawnRun(taskId);
		}
		return next;
	}
	if (key === "q" || key === "\x1B") {
		return { ...state, mode: "list" as const, confirmTask: null };
	}
	return state;
}
