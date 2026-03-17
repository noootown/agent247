import {
	actionComplete,
	actionOpenUrl,
	actionPending,
	actionRun,
	actionSoftDelete,
	actionStop,
	actionToggle,
} from "../actions.js";
import type { State, VisibleLine, WatchContext } from "../state.js";

export function handleKey(
	key: string,
	state: State,
	lines: VisibleLine[],
	ctx: WatchContext,
): State {
	const line = lines[state.cursor];

	if (key === "\x1B[A") {
		const cursor = state.cursor <= 0 ? lines.length - 1 : state.cursor - 1;
		return { ...state, cursor };
	}
	if (key === "\x1B[B") {
		const cursor =
			state.cursor < 0 || state.cursor >= lines.length - 1
				? 0
				: state.cursor + 1;
		return { ...state, cursor };
	}
	if (key === "\x1B[C") {
		if (line?.type === "group") {
			line.group.expanded = true;
			return { ...state };
		}
		if (line?.type === "run")
			return {
				...state,
				mode: "split",
				splitRun: line.run,
				reportScroll: 0,
				reportScrollX: 0,
			};
		return state;
	}
	if (key === "\x1B[D") {
		if (line?.type === "group") {
			line.group.expanded = false;
			return { ...state };
		}
		return state;
	}
	if (key === "\r") {
		if (line?.type === "run")
			return {
				...state,
				mode: "split",
				splitRun: line.run,
				reportScroll: 0,
				reportScrollX: 0,
			};
		if (line?.type === "group") {
			line.group.expanded = !line.group.expanded;
			return { ...state };
		}
		return state;
	}

	if (key === "?") return { ...state, mode: "help" };

	if (!line) return state;
	if (key === "c") return actionComplete(state, line, ctx);
	if (key === "p") return actionPending(state, line, ctx);
	if (key === "u") return actionOpenUrl(state, line, ctx);
	if (key === "\x1B[3~") return actionSoftDelete(state, line, ctx);
	if (key === "r") return actionRun(state, line);
	if (key === "x") return actionStop(state, line, ctx);
	if (key === "t") return actionToggle(state, line, ctx);

	return state;
}
