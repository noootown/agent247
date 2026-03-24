import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FILE } from "../../../lib/constants.js";
import type { RunRecord } from "../../../lib/report.js";
import {
	RUN_TABS,
	type State,
	TAB_NAMES,
	type TaskGroup,
	type VisibleLine,
} from "../state.js";
import {
	BOLD,
	DIM,
	fitToWidth,
	formatAgo,
	formatTime,
	GREEN,
	MAGENTA,
	RED,
	RESET,
	SEPARATOR,
	scrollAnsi,
	stripAnsi,
	visibleWidth,
	YELLOW,
} from "./ansi.js";
import { renderListRow } from "./list.js";
import { getPrettifier } from "./prettifiers.js";

const TAB_ACTIVE_BG = "\x1B[44m\x1B[97m"; // bright white on blue
const FOOTER_COMMON = `wasd scroll  1-${TAB_NAMES.length}/tab tabs  ? help`;
const FOOTER_SPLIT = `  ${DIM}f full  p prompt  q quit  ↑↓ navigate  ${FOOTER_COMMON}${RESET}`;
const FOOTER_FULL = `  ${DIM}f/q/esc back  ${FOOTER_COMMON}${RESET}`;

function renderTabBar(activeTab: number): string {
	const parts = TAB_NAMES.map((name, i) => {
		const num = `${i + 1}`;
		if (i === activeTab) {
			return `${TAB_ACTIVE_BG}${BOLD} ${num}:${name} ${RESET}`;
		}
		return `${DIM} ${num}:${name} ${RESET}`;
	});
	return parts.join("");
}

export function getReportLines(
	run: RunRecord,
	width = 40,
	activeTab = 0,
): string[] {
	const tabName = RUN_TABS[activeTab] ?? FILE.REPORT;
	const prettify = getPrettifier(tabName);

	// Virtual tabs read from data.json; file tabs read their own file
	const filePath = tabName.includes(".")
		? join(run.dir, tabName)
		: join(run.dir, FILE.DATA);
	const content = existsSync(filePath)
		? readFileSync(filePath, "utf-8")
		: `No ${tabName} available.`;

	return prettify(content, run, width);
}

export function getTaskInfoLines(group: TaskGroup, width = 40): string[] {
	const { config } = group;
	const errors = group.runs.filter((r) => r.meta.status === "error").length;
	const completed = group.runs.filter(
		(r) => r.meta.status === "completed",
	).length;
	const processing = group.runs.filter(
		(r) => r.meta.status === "processing",
	).length;
	const canceled = group.runs.filter(
		(r) => r.meta.status === "canceled",
	).length;

	const lines = [
		`${BOLD}Task: ${MAGENTA}${group.task}${RESET}`,
		`${DIM}${config.name}${RESET}`,
		"",
		`Status: ${group.running ? `${YELLOW}running${RESET}` : group.enabled ? `${GREEN}enabled${RESET}` : `${DIM}disabled${RESET}`}`,
		group.schedule ? `Schedule: ${group.schedule}` : null,
		group.lastCheck
			? `Last run: ${formatTime(group.lastCheck)} ${DIM}(${formatAgo(Date.parse(group.lastCheck))})${RESET}`
			: null,
		"",
		`${"─".repeat(width)}`,
		"",
		`${BOLD}Config${RESET}`,
		`  Model: ${config.model}`,
		`  Timeout: ${config.timeout}s`,
		`  Mode: ${config.prompt_mode}`,
		config.cwd ? `  CWD: ${DIM}${config.cwd}${RESET}` : null,
		config.bypass_dedup ? `  Bypass dedup: ${GREEN}yes${RESET}` : null,
		config.cleanup
			? `  Cleanup: ${DIM}when ${config.cleanup.when}${config.cleanup.teardown ? " + teardown" : ""}${RESET}`
			: null,
		"",
		`${"─".repeat(width)}`,
		"",
		`${BOLD}Runs${RESET}`,
		`  Total: ${group.runs.length}`,
		completed > 0 ? `  ${GREEN}Completed: ${completed}${RESET}` : null,
		errors > 0 ? `  ${RED}Errors: ${errors}${RESET}` : null,
		processing > 0 ? `  ${YELLOW}Processing: ${processing}${RESET}` : null,
		canceled > 0 ? `  ${DIM}Canceled: ${canceled}${RESET}` : null,
	];

	return lines.filter((l): l is string => l !== null);
}

function getRightPaneLines(
	state: State,
	lines: VisibleLine[],
	width = 40,
): string[] {
	const line = lines[state.cursor];
	if (line?.type === "run" && state.splitRun) {
		return getReportLines(state.splitRun, width, state.activeTab);
	}
	if (line?.type === "group") {
		return getTaskInfoLines(line.group, width);
	}
	return ["Navigate to a task or run to view details."];
}

export function renderSplitHorizontal(
	state: State,
	lines: VisibleLine[],
	botName: string,
): void {
	const rows = process.stdout.rows ?? 24;
	const cols = process.stdout.columns ?? 80;
	const leftWidth = Math.floor(cols * 0.4);
	const rightWidth = cols - leftWidth - 1;
	const contentRows = rows - 3;

	let { cursor, scroll } = state;
	if (cursor >= 0) {
		if (cursor < scroll) scroll = cursor;
		if (cursor >= scroll + contentRows) scroll = cursor - contentRows + 1;
	}
	if (lines.length > 0 && cursor >= lines.length) cursor = lines.length - 1;

	const reportLines = getRightPaneLines(state, lines, rightWidth);

	// Cap reportScrollX to longest visible line
	const maxLen = reportLines.reduce(
		(max, l) => Math.max(max, visibleWidth(stripAnsi(l))),
		0,
	);
	const cappedScrollX = Math.min(
		state.reportScrollX,
		Math.max(0, maxLen - rightWidth + 1),
	);

	// Cap scroll values to prevent unbounded growth
	const maxReportScroll = Math.max(0, reportLines.length - contentRows);
	const reportScroll = Math.min(
		Math.max(0, state.reportScroll),
		maxReportScroll,
	);
	state.reportScroll = reportScroll;
	state.reportScrollX = cappedScrollX;

	const visibleReport = reportLines.slice(
		reportScroll,
		reportScroll + contentRows,
	);

	process.stdout.write("\x1B[2J\x1B[H");

	const cursorLine = lines[state.cursor];
	const rightHeader =
		cursorLine?.type === "run"
			? ` ${renderTabBar(state.activeTab)}`
			: ` ${BOLD}Task Info${RESET}`;
	const leftHeader = ` ${BOLD}${botName}${RESET} — ${state.groups.length} tasks`;
	const leftHeaderPad = " ".repeat(
		Math.max(0, leftWidth - visibleWidth(stripAnsi(leftHeader))),
	);
	process.stdout.write(
		`${leftHeader}${leftHeaderPad}${SEPARATOR}${rightHeader}\n`,
	);
	process.stdout.write(
		`${DIM}${"─".repeat(leftWidth)}┼${"─".repeat(rightWidth)}${RESET}\n`,
	);

	const visibleList = lines.slice(scroll, scroll + contentRows);
	for (let i = 0; i < contentRows; i++) {
		const listLine = visibleList[i];
		const reportLine = visibleReport[i] ?? "";

		let left: string;
		if (listLine) {
			const selected = listLine.index === cursor;
			left = renderListRow(listLine, leftWidth, selected);
		} else {
			left = " ".repeat(leftWidth);
		}
		const leftLen = visibleWidth(stripAnsi(left));
		if (leftLen < leftWidth) left += " ".repeat(leftWidth - leftLen);

		const colorRight = ` ${reportLine}`;
		const scrolled = scrollAnsi(colorRight, cappedScrollX);
		const right = fitToWidth(scrolled, rightWidth);

		process.stdout.write(`${left}${SEPARATOR}${right}\n`);
	}

	process.stdout.write(FOOTER_SPLIT);
}

export function renderSplitVertical(
	state: State,
	lines: VisibleLine[],
	botName: string,
): void {
	const rows = process.stdout.rows ?? 24;
	const cols = process.stdout.columns ?? 80;
	const topRows = Math.floor((rows - 5) * 0.4);
	const bottomRows = rows - 6 - topRows; // -6: header, separator, empty line, tab bar, separator, footer

	let { cursor, scroll } = state;
	if (cursor >= 0) {
		if (cursor < scroll) scroll = cursor;
		if (cursor >= scroll + topRows) scroll = cursor - topRows + 1;
	}
	if (lines.length > 0 && cursor >= lines.length) cursor = lines.length - 1;

	const reportLines = getRightPaneLines(state, lines, cols);

	const maxLen = reportLines.reduce(
		(max, l) => Math.max(max, visibleWidth(stripAnsi(l))),
		0,
	);
	const cappedScrollX = Math.min(
		state.reportScrollX,
		Math.max(0, maxLen - cols + 1),
	);

	// Cap scroll values to prevent unbounded growth
	const maxReportScroll = Math.max(0, reportLines.length - bottomRows);
	const reportScroll = Math.min(
		Math.max(0, state.reportScroll),
		maxReportScroll,
	);
	state.reportScroll = reportScroll;
	state.reportScrollX = cappedScrollX;

	const visibleReport = reportLines.slice(
		reportScroll,
		reportScroll + bottomRows,
	);

	process.stdout.write("\x1B[2J\x1B[H");
	process.stdout.write(
		` ${BOLD}${botName}${RESET} — ${state.groups.length} tasks\n`,
	);
	process.stdout.write(`${DIM}${"─".repeat(cols)}${RESET}\n`);

	const visibleList = lines.slice(scroll, scroll + topRows);
	for (let i = 0; i < topRows; i++) {
		const listLine = visibleList[i];
		if (listLine) {
			const selected = listLine.index === cursor;
			process.stdout.write(`${renderListRow(listLine, cols, selected)}\n`);
		} else {
			process.stdout.write("\n");
		}
	}

	process.stdout.write("\n");
	const cursorLine = lines[state.cursor];
	if (cursorLine?.type === "run") {
		process.stdout.write(` ${renderTabBar(state.activeTab)}\n`);
	} else {
		process.stdout.write(` ${BOLD}Task Info${RESET}\n`);
	}
	process.stdout.write(`${DIM}${"─".repeat(cols)}${RESET}\n`);

	for (let i = 0; i < bottomRows; i++) {
		const reportLine = visibleReport[i] ?? "";
		const colorRight = ` ${reportLine}`;
		const scrolled = scrollAnsi(colorRight, cappedScrollX);
		process.stdout.write(`${fitToWidth(scrolled, cols)}\n`);
	}

	process.stdout.write(FOOTER_SPLIT);
}

function renderFullPane(
	state: State,
	lines: VisibleLine[],
	_botName: string,
): void {
	const rows = process.stdout.rows ?? 24;
	const cols = process.stdout.columns ?? 80;
	const contentRows = rows - 3;

	const reportLines = getRightPaneLines(state, lines, cols);

	const maxLen = reportLines.reduce(
		(max, l) => Math.max(max, visibleWidth(stripAnsi(l))),
		0,
	);
	const cappedScrollX = Math.min(
		state.reportScrollX,
		Math.max(0, maxLen - cols + 1),
	);

	const maxReportScroll = Math.max(0, reportLines.length - contentRows);
	const reportScroll = Math.min(
		Math.max(0, state.reportScroll),
		maxReportScroll,
	);
	state.reportScroll = reportScroll;
	state.reportScrollX = cappedScrollX;

	const visibleReport = reportLines.slice(
		reportScroll,
		reportScroll + contentRows,
	);

	process.stdout.write("\x1B[2J\x1B[H");

	const cursorLine = lines[state.cursor];
	const header =
		cursorLine?.type === "run"
			? ` ${renderTabBar(state.activeTab)}`
			: ` ${BOLD}Task Info${RESET}`;
	process.stdout.write(`${header}\n`);
	process.stdout.write(`${DIM}${"─".repeat(cols)}${RESET}\n`);

	for (let i = 0; i < contentRows; i++) {
		const reportLine = visibleReport[i] ?? "";
		const colorRight = ` ${reportLine}`;
		const scrolled = scrollAnsi(colorRight, cappedScrollX);
		process.stdout.write(`${fitToWidth(scrolled, cols)}\n`);
	}

	process.stdout.write(FOOTER_FULL);
}

export function renderSplit(
	state: State,
	lines: VisibleLine[],
	botName: string,
): void {
	if (state.fullPane) {
		renderFullPane(state, lines, botName);
		return;
	}
	const rows = process.stdout.rows ?? 24;
	const cols = process.stdout.columns ?? 80;
	if (cols / rows < 2.5) {
		renderSplitVertical(state, lines, botName);
	} else {
		renderSplitHorizontal(state, lines, botName);
	}
}
