import type { State } from "../state.js";
import { BOLD, RESET } from "./ansi.js";

export function renderConfirmRun(state: State): void {
	const rows = process.stdout.rows ?? 24;
	const cols = process.stdout.columns ?? 80;

	const title = " Confirm ";
	const msg = `Run task "${state.confirmTask}"?`;
	const SEL_BTN = "\x1B[30m\x1B[46m";
	const yesBtn =
		state.confirmChoice === "yes"
			? `${SEL_BTN} Yes ${RESET}\x1B[47m\x1B[30m`
			: " Yes ";
	const noBtn =
		state.confirmChoice === "no"
			? `${SEL_BTN} No ${RESET}\x1B[47m\x1B[30m`
			: " No ";
	const buttons = `${yesBtn}    ${noBtn}`;
	const buttonsPlain = " Yes      No ";
	const innerWidth =
		Math.max(msg.length, buttonsPlain.length, title.length) + 4;
	const boxWidth = innerWidth + 2;
	const startCol = Math.floor((cols - boxWidth) / 2);
	const startRow = Math.floor(rows / 2) - 2;

	const BG = "\x1B[47m\x1B[30m";
	const BORDER = "\x1B[47m\x1B[90m";

	const pad = (text: string, plainLen: number, width: number) =>
		text + " ".repeat(Math.max(0, width - plainLen));

	const titlePad = innerWidth - title.length;
	const titleLeft = Math.floor(titlePad / 2);
	const titleRight = titlePad - titleLeft;
	const topBorder = `${BORDER}┌${"─".repeat(titleLeft)}${BOLD}${title}${RESET}${BORDER}${"─".repeat(titleRight)}┐${RESET}`;

	const emptyLine = `${BG}│${" ".repeat(innerWidth)}│${RESET}`;
	const msgLine = `${BG}│${pad(`  ${msg}`, msg.length + 2, innerWidth)}│${RESET}`;
	const btnLine = `${BG}│${pad(`  ${buttons}`, buttonsPlain.length + 2, innerWidth)}│${RESET}`;
	const bottomBorder = `${BORDER}└${"─".repeat(innerWidth)}┘${RESET}`;

	const boxLines = [
		topBorder,
		emptyLine,
		msgLine,
		emptyLine,
		btnLine,
		emptyLine,
		bottomBorder,
	];

	for (let i = 0; i < boxLines.length; i++) {
		process.stdout.write(`\x1B[${startRow + i};${startCol}H${boxLines[i]}`);
	}
}
