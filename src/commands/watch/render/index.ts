import type { State, VisibleLine } from "../state.js";
import { renderConfirmRun } from "./confirm.js";
import { renderHelp } from "./help.js";
import { renderSplit } from "./split.js";

export function render(
	state: State,
	lines: VisibleLine[],
	botName: string,
): void {
	if (state.mode === "confirm-run") {
		renderSplit(state, lines, botName);
		renderConfirmRun(state);
	} else if (state.mode === "split") {
		renderSplit(state, lines, botName);
	} else {
		renderHelp();
	}
}
