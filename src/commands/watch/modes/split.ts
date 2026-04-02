import {
	actionCustomHotkey,
	actionMark,
	actionOpenUrl,
	actionRerun,
	actionRun,
	actionStop,
	actionToggle,
	actionToggleMarkedFilter,
} from "../actions.js";
import { applyScroll, ScrollDirection } from "../scroll.js";
import {
	RUN_TABS,
	type State,
	type VisibleLine,
	type WatchContext,
} from "../state.js";

const SPLIT_SCROLL_KEYS: Record<string, ScrollDirection> = {
	w: ScrollDirection.UP,
	s: ScrollDirection.DOWN,
	a: ScrollDirection.LEFT,
	d: ScrollDirection.RIGHT,
	"\x1B[H": ScrollDirection.HOME,
	"\x1B[1~": ScrollDirection.HOME,
	"\x1B[F": ScrollDirection.END,
	"\x1B[4~": ScrollDirection.END,
};

function withSplitRun(state: State, lines: VisibleLine[]): State {
	const line = lines[state.cursor];
	const splitRun = line?.type === "run" ? line.run : null;
	return {
		...state,
		splitRun,
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
		const fullDir = SPLIT_SCROLL_KEYS[key];
		if (fullDir !== undefined) {
			const { scrollY, scrollX } = applyScroll(
				fullDir,
				state.reportScroll,
				state.reportScrollX,
				Number.MAX_SAFE_INTEGER,
			);
			return { ...state, reportScroll: scrollY, reportScrollX: scrollX };
		}
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
		return withSplitRun({ ...state, cursor, selected: new Set() }, lines);
	}
	if (key === "\x1B[B") {
		const cursor =
			state.cursor < 0 || state.cursor >= lines.length - 1
				? 0
				: state.cursor + 1;
		return withSplitRun({ ...state, cursor, selected: new Set() }, lines);
	}
	// Shift+Up/Down: move cursor and toggle selection
	if (key === "\x1B[1;2A") {
		const selected = new Set(state.selected);
		selected.add(state.cursor);
		const cursor = state.cursor <= 0 ? lines.length - 1 : state.cursor - 1;
		selected.add(cursor);
		return withSplitRun({ ...state, cursor, selected }, lines);
	}
	if (key === "\x1B[1;2B") {
		const selected = new Set(state.selected);
		selected.add(state.cursor);
		const cursor =
			state.cursor < 0 || state.cursor >= lines.length - 1
				? 0
				: state.cursor + 1;
		selected.add(cursor);
		return withSplitRun({ ...state, cursor, selected }, lines);
	}
	// j: jump to next task group
	if (key === "j") {
		for (let i = state.cursor + 1; i < lines.length; i++) {
			if (lines[i].type === "group") {
				return withSplitRun({ ...state, cursor: i }, lines);
			}
		}
		// Wrap around
		for (let i = 0; i < state.cursor; i++) {
			if (lines[i].type === "group") {
				return withSplitRun({ ...state, cursor: i }, lines);
			}
		}
		return state;
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

	if (key === "?") return { ...state, mode: "help", helpScroll: 0 };

	// Number keys: switch run file tab
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

	// l: toggle layout mode
	if (key === "l") {
		return {
			...state,
			layoutMode: state.layoutMode === "vertical" ? "horizontal" : "vertical",
		};
	}

	const dir = SPLIT_SCROLL_KEYS[key];
	if (dir !== undefined) {
		const { scrollY, scrollX } = applyScroll(
			dir,
			state.reportScroll,
			state.reportScrollX,
			Number.MAX_SAFE_INTEGER,
		);
		const followBottom =
			dir === ScrollDirection.UP || dir === ScrollDirection.HOME
				? false
				: state.followBottom;
		return {
			...state,
			reportScroll: scrollY,
			reportScrollX: scrollX,
			followBottom,
		};
	}

	// z: toggle all groups collapsed/expanded
	if (key === "z") {
		const allExpanded = state.groups.every((g) => g.expanded);
		for (const g of state.groups) g.expanded = !allExpanded;
		return { ...state };
	}

	if (key === "M") return actionToggleMarkedFilter(state);
	if (!line) return state;
	if (key === "u") return actionOpenUrl(state, line, ctx);
	if (key === "r") {
		if (line.type === "run") return actionRerun(state, line);
		return actionRun(state, line);
	}
	if (key === "x") {
		if (line.type === "group") return actionStop(state, line);
		if (line.type === "run" && line.run.meta.status !== "processing") {
			// If multi-selected, confirm delete for all; otherwise just the current
			const toDelete =
				state.selected.size > 0
					? new Set(state.selected)
					: new Set([state.cursor]);
			return {
				...state,
				mode: "confirm-delete" as const,
				confirmChoice: "yes",
				selected: toDelete,
			};
		}
		return state;
	}
	if (key === "t") return actionToggle(state, line, ctx);
	if (key === "m") return actionMark(state, line, ctx);

	// Custom hotkeys from settings.yaml
	const hotkey = ctx.hotkeys.find((h) => h.key === key);
	if (hotkey) return actionCustomHotkey(state, line ?? lines[0], hotkey, ctx);

	return state;
}
