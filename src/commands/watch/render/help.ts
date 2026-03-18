import { BOLD, DIM, GREEN, RESET, YELLOW } from "./ansi.js";

export function renderHelp(): void {
	const rows = process.stdout.rows ?? 24;
	process.stdout.write("\x1B[2J\x1B[H");

	const helpLines = [
		"",
		`  ${BOLD}Keybindings${RESET}`,
		"",
		`  ${BOLD}Navigation${RESET}`,
		`    ↑ / ↓       Move selection up / down`,
		`    ← / →       Collapse / expand task group`,
		`    Enter       Toggle group expansion`,
		`    w/a/s/d     Scroll detail pane (up/left/down/right)`,
		"",
		`  ${BOLD}Actions${RESET}`,
		`    c           Mark selected run as ${GREEN}completed${RESET}`,
		`    p           Mark selected run as ${YELLOW}pending${RESET}`,
		`    r           Run selected task`,
		`    x           Stop running task`,
		`    t           Toggle task enabled/disabled`,
		`    u           Open run URL in browser`,
		`    Delete      Delete selected run`,
		"",
		`  ${BOLD}General${RESET}`,
		`    ?           Toggle this help`,
		`    q / Esc     Quit`,
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
