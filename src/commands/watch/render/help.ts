import { TAB_NAMES } from "../state.js";
import { BOLD, DIM, RESET } from "./ansi.js";

export function renderHelp(): void {
	const rows = process.stdout.rows ?? 24;
	process.stdout.write("\x1B[2J\x1B[H");

	const helpLines = [
		"",
		`  ${BOLD}Keybindings${RESET}`,
		"",
		`  ${BOLD}Navigation${RESET}`,
		`    ↑ / ↓                   Move selection up / down`,
		`    ← / →                   Collapse / expand task group`,
		`    Enter                   Toggle group expansion`,
		`    w/a/s/d                 Scroll detail pane (up/left/down/right)`,
		`    Home / End              Scroll detail pane to top / bottom`,
		"",
		`  ${BOLD}File Tabs${RESET}  ${DIM}(when viewing a run)${RESET}`,
		`    1-${TAB_NAMES.length}                     Switch to file tab`,
		`    Tab / Ctrl+X            Next tab`,
		`    Shift+Tab / Ctrl+Z      Previous tab`,
		"",
		`  ${BOLD}View${RESET}`,
		`    f                       Toggle full-width pane`,
		`    q / Esc                 Exit full mode (or quit if not in full mode)`,
		"",
		`  ${BOLD}Actions${RESET}`,
		`    r                       Run selected task`,
		`    x                       Stop task / delete run`,
		`    t                       Toggle task enabled/disabled`,
		`    u                       Open run URL in browser`,
		`    e                       Open shell at run's cwd`,
		`    p                       Open Claude at run's cwd`,
		`    v                       Jump to next task group`,
		`    m                       Toggle layout (vertical/horizontal)`,
		"",
		`  ${BOLD}General${RESET}`,
		`    ?                       Toggle this help`,
		`    q / Esc                 Quit`,
		"",
	];

	for (const line of helpLines) {
		process.stdout.write(`${line}\n`);
	}
	const usedRows = helpLines.length;
	for (let i = usedRows; i < rows - 1; i++) {
		process.stdout.write("\n");
	}
	process.stdout.write(`  ${DIM}esc/q/? back${RESET}`);
}
