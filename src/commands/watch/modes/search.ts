import type { State, VisibleLine, WatchContext } from "../state.js";
import { handleKey as splitHandleKey } from "./split.js";

export function handleKey(
	key: string,
	state: State,
	lines: VisibleLine[],
	ctx: WatchContext,
): State {
	// Esc: cancel search, clear query
	if (key === "\x1B") {
		return {
			...state,
			mode: "split",
			searchQuery: "",
			searchConfirmed: false,
			cursor: 0,
		};
	}

	// Enter: confirm search (or cancel if empty)
	if (key === "\r") {
		return {
			...state,
			mode: "split",
			searchConfirmed: state.searchQuery.length > 0,
			cursor: 0,
		};
	}

	// Backspace: remove last character
	if (key === "\x7F") {
		return {
			...state,
			searchQuery: state.searchQuery.slice(0, -1),
		};
	}

	// Printable characters: append to query
	// Filter out control characters and escape sequences
	if (key.length === 1 && key >= " " && key <= "~") {
		return {
			...state,
			searchQuery: state.searchQuery + key,
		};
	}

	// Delegate navigation keys (arrows, etc.) to split handler
	const result = splitHandleKey(key, state, lines, ctx);
	// Keep search mode active even if split handler processes the key
	return { ...result, mode: "search" };
}
