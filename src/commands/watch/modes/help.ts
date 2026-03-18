import type { State, VisibleLine, WatchContext } from "../state.js";

export function handleKey(
	key: string,
	state: State,
	_lines: VisibleLine[],
	_ctx: WatchContext,
): State {
	if (key === "?" || key === "\x1B" || key === "q") {
		return { ...state, mode: "split" };
	}
	return state;
}
