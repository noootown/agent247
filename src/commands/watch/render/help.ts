import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { TAB_NAMES } from "../state.js";
import { BOLD, DIM, RESET } from "./ansi.js";

function getVersion(): string {
	const versionPath = join(
		import.meta.dirname ?? __dirname,
		"../../../version.txt",
	);
	if (existsSync(versionPath)) {
		return readFileSync(versionPath, "utf-8").trim();
	}
	return "dev";
}

const helpLines = [
	"",
	`  ${BOLD}Keybindings${RESET}`,
	"",
	`  ${BOLD}Navigation (Task List)${RESET}`,
	`    ↑ / ↓                   Move selection up / down`,
	`    Shift+↑ / Shift+↓       Multi-select up / down`,
	`    ← / →                   Collapse / expand task group`,
	`    Enter                   Toggle group expansion`,
	`    j                       Jump to next task group`,
	`    z                       Toggle all groups collapsed/expanded`,
	"",
	`  ${BOLD}Navigation (Detail Pane)${RESET}`,
	`    w/a/s/d                 Scroll (up/left/down/right)`,
	`    Home / End              Scroll to top / bottom`,
	`    1-${TAB_NAMES.length}                     Switch file tab`,
	`    Tab / Ctrl+X            Next tab`,
	`    Shift+Tab / Ctrl+Z      Previous tab`,
	`    f                       Toggle full-width pane`,
	"",
	`  ${BOLD}Actions (Task)${RESET}`,
	`    r                       Run selected task`,
	`    x                       Stop running task`,
	`    t                       Toggle task enabled/disabled`,
	"",
	`  ${BOLD}Actions (Run)${RESET}`,
	`    r                       Rerun item`,
	`    m                       Mark/unmark for review`,
	`    M                       Toggle marked-only filter`,
	`    x                       Delete run`,
	`    o                       Open current tab file in VS Code`,
	`    u                       Open run URL in browser`,
	`    e                       Open shell at run's cwd`,
	`    p                       Open Claude at run's cwd`,
	`    v                       Open tmux pane right at run's cwd`,
	`    h                       Open tmux pane below at run's cwd`,
	"",
	`  ${BOLD}General${RESET}`,
	`    l                       Toggle layout (vertical/horizontal)`,
	`    ?                       Toggle this help`,
	`    q / Esc / Ctrl+C        Quit (exits full-width pane first)`,
	"",
];

export function helpMaxScroll(): number {
	const rows = process.stdout.rows ?? 24;
	return Math.max(0, helpLines.length - (rows - 1));
}

export function renderHelp(scroll: number): void {
	const rows = process.stdout.rows ?? 24;
	process.stdout.write("\x1B[2J\x1B[H");

	// Available rows for content (1 row reserved for footer)
	const contentRows = rows - 1;
	const maxScroll = Math.max(0, helpLines.length - contentRows);
	const clampedScroll = Math.min(scroll, maxScroll);
	const visible = helpLines.slice(clampedScroll, clampedScroll + contentRows);

	for (const line of visible) {
		process.stdout.write(`${line}\n`);
	}
	for (let i = visible.length; i < contentRows; i++) {
		process.stdout.write("\n");
	}

	const scrollHint = maxScroll > 0 ? `  ${DIM}↑/↓ scroll${RESET}    ` : "  ";
	process.stdout.write(
		`${scrollHint}${DIM}esc/q/? back${RESET}    ${DIM}${getVersion()}${RESET}`,
	);
}
