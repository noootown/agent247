import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RunRecord } from "../../../lib/report.js";
import type { State, TaskGroup, VisibleLine } from "../state.js";
import {
	BOLD,
	DIM,
	fitToWidth,
	formatAgo,
	GREEN,
	MAGENTA,
	RED,
	RESET,
	SEPARATOR,
	scrollAnsi,
	statusIcon,
	statusText,
	stripAnsi,
	YELLOW,
} from "./ansi.js";
import { renderListRow } from "./list.js";

export function renderMarkdownLine(line: string): string {
	if (/^#{1,3} /.test(line)) {
		return `${BOLD}${line.replace(/^#{1,3} /, "")}${RESET}`;
	}
	line = line.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
	line = line.replace(/`(.+?)`/g, "\x1B[38;2;175;185;254m$1\x1B[0m");
	if (/^---+$/.test(line)) {
		return `${DIM}${"─".repeat(40)}${RESET}`;
	}
	return line;
}

export function getReportLines(run: RunRecord): string[] {
	const header = [
		`${BOLD}Run: ${run.meta.id}${RESET}`,
		`Task: ${BOLD}${MAGENTA}${run.meta.task}${RESET}`,
		`Status: ${statusIcon(run.meta.status)} ${statusText(run.meta.status)}`,
		`Time: ${run.meta.started_at} ${DIM}(${formatAgo(Date.parse(run.meta.started_at))})${RESET}`,
		`Duration: ${run.meta.duration_seconds}s`,
		run.meta.url?.startsWith("http")
			? `URL: \x1B[94m\x1B]8;;${run.meta.url}\x07${run.meta.url}\x1B]8;;\x07${RESET}`
			: null,
		"",
		`${"─".repeat(40)}`,
		"",
	].filter((l): l is string => l !== null);

	const reportPath = join(run.dir, "report.md");
	const report = existsSync(reportPath)
		? readFileSync(reportPath, "utf-8")
		: "No report available.";
	return [...header, ...report.split("\n").map(renderMarkdownLine)];
}

export function getTaskInfoLines(group: TaskGroup): string[] {
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
		"",
		`Status: ${group.running ? `${YELLOW}running${RESET}` : group.enabled ? `${GREEN}enabled${RESET}` : `${DIM}disabled${RESET}`}`,
		group.schedule ? `Schedule: ${group.schedule}` : null,
		group.lastCheck
			? `Last check: ${group.lastCheck} ${DIM}(${formatAgo(Date.parse(group.lastCheck))})${RESET}`
			: null,
		"",
		`${"─".repeat(40)}`,
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

function getRightPaneLines(state: State, lines: VisibleLine[]): string[] {
	const line = lines[state.cursor];
	if (line?.type === "run" && state.splitRun) {
		return getReportLines(state.splitRun);
	}
	if (line?.type === "group") {
		return getTaskInfoLines(line.group);
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

	const reportLines = getRightPaneLines(state, lines);

	// Cap reportScrollX to longest visible line
	const maxLen = reportLines.reduce(
		(max, l) => Math.max(max, stripAnsi(l).length),
		0,
	);
	const cappedScrollX = Math.min(
		state.reportScrollX,
		Math.max(0, maxLen - rightWidth + 1),
	);

	let reportScroll = state.reportScroll;
	if (reportScroll > reportLines.length - contentRows)
		reportScroll = Math.max(0, reportLines.length - contentRows);
	if (reportScroll < 0) reportScroll = 0;

	const visibleReport = reportLines.slice(
		reportScroll,
		reportScroll + contentRows,
	);

	process.stdout.write("\x1B[2J\x1B[H");

	const cursorLine = lines[state.cursor];
	const rightTitle = cursorLine?.type === "run" ? "Report" : "Task Info";
	const leftHeader = ` ${BOLD}${botName}${RESET} — ${state.groups.length} tasks`;
	const rightHeader = ` ${BOLD}${rightTitle}${RESET}`;
	const leftHeaderPad = " ".repeat(
		Math.max(0, leftWidth - stripAnsi(leftHeader).length),
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
		const leftLen = stripAnsi(left).length;
		if (leftLen < leftWidth) left += " ".repeat(leftWidth - leftLen);

		const colorRight = ` ${reportLine}`;
		const scrolled = scrollAnsi(colorRight, cappedScrollX);
		const right = fitToWidth(scrolled, rightWidth);

		process.stdout.write(`${left}${SEPARATOR}${right}\n`);
	}

	process.stdout.write(
		`  ${DIM}↑↓ navigate  wasd scroll  ? help  q quit${RESET}`,
	);
}

export function renderSplitVertical(
	state: State,
	lines: VisibleLine[],
	botName: string,
): void {
	const rows = process.stdout.rows ?? 24;
	const cols = process.stdout.columns ?? 80;
	const topRows = Math.floor((rows - 4) * 0.4);
	const bottomRows = rows - 4 - topRows;

	let { cursor, scroll } = state;
	if (cursor >= 0) {
		if (cursor < scroll) scroll = cursor;
		if (cursor >= scroll + topRows) scroll = cursor - topRows + 1;
	}
	if (lines.length > 0 && cursor >= lines.length) cursor = lines.length - 1;

	const reportLines = getRightPaneLines(state, lines);

	const maxLen = reportLines.reduce(
		(max, l) => Math.max(max, stripAnsi(l).length),
		0,
	);
	const cappedScrollX = Math.min(
		state.reportScrollX,
		Math.max(0, maxLen - cols + 1),
	);

	let reportScroll = state.reportScroll;
	if (reportScroll > reportLines.length - bottomRows)
		reportScroll = Math.max(0, reportLines.length - bottomRows);
	if (reportScroll < 0) reportScroll = 0;

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

	const cursorLine = lines[state.cursor];
	const rightTitle = cursorLine?.type === "run" ? "Report" : "Task Info";
	process.stdout.write(
		`${DIM}${"─".repeat(cols)}${RESET} ${BOLD}${rightTitle}${RESET}\n`,
	);

	for (let i = 0; i < bottomRows; i++) {
		const reportLine = visibleReport[i] ?? "";
		const colorRight = ` ${reportLine}`;
		const scrolled = scrollAnsi(colorRight, cappedScrollX);
		process.stdout.write(`${fitToWidth(scrolled, cols)}\n`);
	}

	process.stdout.write(
		`  ${DIM}↑↓ navigate  wasd scroll  ? help  q quit${RESET}`,
	);
}

export function renderSplit(
	state: State,
	lines: VisibleLine[],
	botName: string,
): void {
	const rows = process.stdout.rows ?? 24;
	const cols = process.stdout.columns ?? 80;
	if (cols / rows < 2.5) {
		renderSplitVertical(state, lines, botName);
	} else {
		renderSplitHorizontal(state, lines, botName);
	}
}
