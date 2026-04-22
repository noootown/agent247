import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { HotkeyConfig } from "../../../lib/settings.js";
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

function buildHelpLines(
	hotkeys: HotkeyConfig[],
	metaKeyLabel: string,
): string[] {
	const lines = [
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
		`    t                       Toggle task cron schedule`,
		"",
		`  ${BOLD}Actions (Run)${RESET}`,
		`    r                       Rerun item`,
		`    m                       Mark/unmark for review`,
		`    M                       Toggle marked-only filter`,
		`    x                       Delete run`,
		`    u                       Open run URL in browser`,
		"",
	];

	if (hotkeys.length > 0 && metaKeyLabel) {
		lines.push(
			`  ${BOLD}Custom Hotkeys${RESET}  ${DIM}(${metaKeyLabel} + key)${RESET}`,
		);
		for (const h of hotkeys) {
			lines.push(`    ${h.key}                       ${h.description}`);
		}
		lines.push("");
	} else if (hotkeys.length > 0) {
		lines.push(`  ${BOLD}Custom Hotkeys${RESET}  ${DIM}(disabled)${RESET}`);
		lines.push(
			`    ${DIM}Add meta_key (a-z) to settings.yaml to enable${RESET}`,
		);
		lines.push("");
	}

	lines.push(
		`  ${BOLD}General${RESET}`,
		`    l                       Toggle layout (vertical/horizontal)`,
		`    /                       Search / filter runs`,
		`    ?                       Toggle this help`,
		`    q / Esc / Ctrl+C        Quit (exits full-width pane first)`,
		"",
	);

	return lines;
}

export function helpMaxScroll(
	hotkeys: HotkeyConfig[] = [],
	metaKeyLabel = "Ctrl+S",
): number {
	const rows = process.stdout.rows ?? 24;
	const lines = buildHelpLines(hotkeys, metaKeyLabel);
	return Math.max(0, lines.length - (rows - 1));
}

export function renderHelp(
	scroll: number,
	hotkeys: HotkeyConfig[] = [],
	metaKeyLabel = "Ctrl+S",
): void {
	const rows = process.stdout.rows ?? 24;
	process.stdout.write("\x1B[2J\x1B[H");

	const lines = buildHelpLines(hotkeys, metaKeyLabel);
	const contentRows = rows - 1;
	const maxScroll = Math.max(0, lines.length - contentRows);
	const clampedScroll = Math.min(scroll, maxScroll);
	const visible = lines.slice(clampedScroll, clampedScroll + contentRows);

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
