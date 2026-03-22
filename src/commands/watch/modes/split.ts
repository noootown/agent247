import {
	actionOpenUrl,
	actionRun,
	actionSoftDelete,
	actionStop,
	actionToggle,
} from "../actions.js";
import {
	RUN_TABS,
	type State,
	type VisibleLine,
	type WatchContext,
} from "../state.js";

function withSplitRun(state: State, lines: VisibleLine[]): State {
	const line = lines[state.cursor];
	const splitRun = line?.type === "run" ? line.run : null;
	return {
		...state,
		splitRun,
		activeTab: 0,
		reportScroll: 0,
		reportScrollX: 0,
	};
}

export function handleKey(
	key: string,
	state: State,
	lines: VisibleLine[],
	ctx: WatchContext,
): State {
	const line = lines[state.cursor];

	// In full pane mode, only allow pane-relevant keys
	if (state.fullPane) {
		if (key === "f") return { ...state, fullPane: false };
		if (key === "w")
			return { ...state, reportScroll: Math.max(0, state.reportScroll - 1) };
		if (key === "s") return { ...state, reportScroll: state.reportScroll + 1 };
		if (key === "\x1B[H" || key === "\x1B[1~")
			return { ...state, reportScroll: 0 };
		if (key === "\x1B[F" || key === "\x1B[4~")
			return { ...state, reportScroll: Number.MAX_SAFE_INTEGER };
		if (key === "a")
			return { ...state, reportScrollX: Math.max(0, state.reportScrollX - 4) };
		if (key === "d")
			return { ...state, reportScrollX: state.reportScrollX + 4 };
		const tabNum = Number.parseInt(key, 10);
		if (tabNum >= 1 && tabNum <= RUN_TABS.length) {
			return {
				...state,
				activeTab: tabNum - 1,
				reportScroll: 0,
				reportScrollX: 0,
			};
		}
		if (key === "\t" || key === "\x18") {
			return {
				...state,
				activeTab: (state.activeTab + 1) % RUN_TABS.length,
				reportScroll: 0,
				reportScrollX: 0,
			};
		}
		if (key === "\x1B[Z" || key === "\x1A") {
			return {
				...state,
				activeTab: (state.activeTab - 1 + RUN_TABS.length) % RUN_TABS.length,
				reportScroll: 0,
				reportScrollX: 0,
			};
		}
		return state;
	}

	if (key === "\x1B[A") {
		const cursor = state.cursor <= 0 ? lines.length - 1 : state.cursor - 1;
		return withSplitRun({ ...state, cursor }, lines);
	}
	if (key === "\x1B[B") {
		const cursor =
			state.cursor < 0 || state.cursor >= lines.length - 1
				? 0
				: state.cursor + 1;
		return withSplitRun({ ...state, cursor }, lines);
	}
	if (key === "\x1B[C") {
		if (line?.type === "group") {
			line.group.expanded = true;
			return { ...state };
		}
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
		if (line?.type === "group") {
			line.group.expanded = !line.group.expanded;
			return { ...state };
		}
		return state;
	}

	if (key === "?") return { ...state, mode: "help" };

	// Number keys 1-7: switch run file tab
	const tabNum = Number.parseInt(key, 10);
	if (tabNum >= 1 && tabNum <= RUN_TABS.length && line?.type === "run") {
		return {
			...state,
			activeTab: tabNum - 1,
			reportScroll: 0,
			reportScrollX: 0,
		};
	}
	// Tab/Ctrl+X: next tab, Shift+Tab/Ctrl+Z: previous tab
	if ((key === "\t" || key === "\x18") && line?.type === "run") {
		return {
			...state,
			activeTab: (state.activeTab + 1) % RUN_TABS.length,
			reportScroll: 0,
			reportScrollX: 0,
		};
	}
	if ((key === "\x1B[Z" || key === "\x1A") && line?.type === "run") {
		return {
			...state,
			activeTab: (state.activeTab - 1 + RUN_TABS.length) % RUN_TABS.length,
			reportScroll: 0,
			reportScrollX: 0,
		};
	}

	// f: toggle full-width right pane
	if (key === "f") return { ...state, fullPane: !state.fullPane };

	if (key === "w")
		return { ...state, reportScroll: Math.max(0, state.reportScroll - 1) };
	if (key === "s") return { ...state, reportScroll: state.reportScroll + 1 };
	if (key === "\x1B[H" || key === "\x1B[1~")
		return { ...state, reportScroll: 0 };
	if (key === "\x1B[F" || key === "\x1B[4~")
		return { ...state, reportScroll: Number.MAX_SAFE_INTEGER };
	if (key === "a")
		return {
			...state,
			reportScrollX: Math.max(0, state.reportScrollX - 4),
		};
	if (key === "d") return { ...state, reportScrollX: state.reportScrollX + 4 };

	if (!line) return state;
	if (key === "u") return actionOpenUrl(state, line, ctx);
	if (key === "r") return actionRun(state, line);
	if (key === "x") {
		if (line.type === "group") return actionStop(state, line, ctx);
		return actionSoftDelete(state, line, ctx);
	}
	if (key === "t") return actionToggle(state, line, ctx);

	return state;
}
