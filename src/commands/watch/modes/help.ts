import { helpMaxScroll } from "../render/help.js";
import type { State, VisibleLine, WatchContext } from "../state.js";

export function handleKey(
	key: string,
	state: State,
	_lines: VisibleLine[],
	_ctx: WatchContext,
): State {
	if (key === "?" || key === "\x1B" || key === "q") {
		return { ...state, mode: "split", helpScroll: 0 };
	}
	const max = helpMaxScroll();
	// Scroll: up arrow / w
	if (key === "\x1B[A" || key === "w") {
		return { ...state, helpScroll: Math.max(0, state.helpScroll - 1) };
	}
	// Scroll: down arrow / s
	if (key === "\x1B[B" || key === "s") {
		return { ...state, helpScroll: Math.min(max, state.helpScroll + 1) };
	}
	// Home
	if (key === "\x1B[H" || key === "\x1B[1~") {
		return { ...state, helpScroll: 0 };
	}
	// End
	if (key === "\x1B[F" || key === "\x1B[4~") {
		return { ...state, helpScroll: max };
	}
	return state;
}
