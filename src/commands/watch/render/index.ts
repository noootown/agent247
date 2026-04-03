import type { HotkeyConfig } from "../settings.js";
import type { State, VisibleLine } from "../state.js";
import {
	renderConfirmDelete,
	renderConfirmRerun,
	renderConfirmRun,
	renderConfirmStop,
} from "./confirm.js";
import { renderHelp } from "./help.js";
import { renderSplit } from "./split.js";

export function render(
	state: State,
	lines: VisibleLine[],
	botName: string,
	hotkeys: HotkeyConfig[] = [],
	metaKeyLabel = "Ctrl+S",
): void {
	if (
		state.mode === "confirm-run" ||
		state.mode === "confirm-rerun" ||
		state.mode === "confirm-stop" ||
		state.mode === "confirm-delete"
	) {
		renderSplit(state, lines, botName);
		if (state.mode === "confirm-run") renderConfirmRun(state);
		else if (state.mode === "confirm-rerun") renderConfirmRerun(state);
		else if (state.mode === "confirm-stop") renderConfirmStop(state);
		else renderConfirmDelete(state, lines);
	} else if (state.mode === "split") {
		renderSplit(state, lines, botName);
	} else {
		renderHelp(state.helpScroll, hotkeys, metaKeyLabel);
	}
}
