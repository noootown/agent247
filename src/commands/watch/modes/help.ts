import { helpMaxScroll } from "../render/help.js";
import { applyScroll, ScrollDirection } from "../scroll.js";
import type { State, VisibleLine, WatchContext } from "../state.js";

const HELP_SCROLL_KEYS: Record<string, ScrollDirection> = {
	"\x1B[A": ScrollDirection.UP,
	"\x1B[B": ScrollDirection.DOWN,
	"\x1B[H": ScrollDirection.HOME,
	"\x1B[1~": ScrollDirection.HOME,
	"\x1B[F": ScrollDirection.END,
	"\x1B[4~": ScrollDirection.END,
};

export function handleKey(
	key: string,
	state: State,
	_lines: VisibleLine[],
	_ctx: WatchContext,
): State {
	if (key === "?" || key === "\x1B" || key === "q") {
		return { ...state, mode: "split", helpScroll: 0 };
	}
	const dir = HELP_SCROLL_KEYS[key];
	if (dir !== undefined) {
		const { scrollY } = applyScroll(
			dir,
			state.helpScroll,
			0,
			helpMaxScroll(_ctx.hotkeys, _ctx.metaKeyLabel),
		);
		return { ...state, helpScroll: scrollY };
	}
	return state;
}
