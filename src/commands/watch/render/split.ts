import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RunRecord } from "../../../lib/report.js";
import {
	RUN_TABS,
	type State,
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
	hyperlink,
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

export function renderMarkdownLine(line: string, width = 40): string {
	if (/^#{1,3} /.test(line)) {
		return `${BOLD}${line.replace(/^#{1,3} /, "")}${RESET}`;
	}
	line = line.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
	line = line.replace(/`(.+?)`/g, "\x1B[38;2;175;185;254m$1\x1B[0m");
	if (/^---+$/.test(line)) {
		return `${DIM}${"─".repeat(width)}${RESET}`;
	}
	return line;
}

const TAB_LABELS = [
	"report",
	"transcript",
	"prompt",
	"log",
	"meta",
	"vars",
	"response",
];
const TAB_ACTIVE_BG = "\x1B[44m\x1B[97m"; // bright white on blue

function renderTabBar(activeTab: number): string {
	const parts = TAB_LABELS.map((label, i) => {
		const num = `${i + 1}`;
		if (i === activeTab) {
			return `${TAB_ACTIVE_BG} ${num}:${label} ${RESET}`;
		}
		return `${DIM} ${num}:${label} ${RESET}`;
	});
	return parts.join("");
}

// ── File prettifiers ──
// Each takes (content, run, width) and returns styled lines

type Prettifier = (content: string, run: RunRecord, width: number) => string[];

const JSON_KEY = "\x1B[38;2;137;180;250m"; // light blue
const JSON_STRING = "\x1B[38;2;206;145;120m"; // warm orange
const JSON_NUMBER = "\x1B[38;2;181;206;168m"; // soft green
const JSON_BOOL = "\x1B[38;2;206;145;120m"; // warm orange
const JSON_NULL = `${DIM}`;
const LOG_TIMESTAMP = `${DIM}`;

function markdownPrettifier(
	content: string,
	_run: RunRecord,
	width: number,
): string[] {
	return content.split("\n").map((l) => renderMarkdownLine(l, width));
}

function metaPrettifier(
	_content: string,
	run: RunRecord,
	_width: number,
): string[] {
	const m = run.meta;
	return [
		`${BOLD}Run${RESET}`,
		`  ID: ${m.id}`,
		`  Task: ${BOLD}${MAGENTA}${m.task}${RESET}`,
		`  Status: ${statusIcon(m.status)} ${statusText(m.status)}`,
		"",
		`${BOLD}Timing${RESET}`,
		`  Started: ${formatTime(m.started_at)} ${DIM}(${formatAgo(Date.parse(m.started_at))})${RESET}`,
		`  Finished: ${formatTime(m.finished_at)} ${DIM}(${formatAgo(Date.parse(m.finished_at))})${RESET}`,
		`  Duration: ${m.duration_seconds}s`,
		"",
		`${BOLD}Details${RESET}`,
		m.url?.startsWith("http")
			? `  URL: \x1B[94m${hyperlink(m.url, m.url)}${RESET}`
			: `  URL: ${DIM}—${RESET}`,
		`  Item key: ${m.item_key ?? `${DIM}—${RESET}`}`,
		`  Exit code: ${m.exit_code === 0 ? `${GREEN}${m.exit_code}${RESET}` : `${RED}${m.exit_code}${RESET}`}`,
		`  Schema: v${m.schema_version}`,
	];
}

function jsonPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return content.split("\n").map((line) =>
		line
			.replace(/"([^"]+)"(?=\s*:)/g, `${JSON_KEY}"$1"${RESET}`)
			.replace(/:\s*"([^"]*)"(,?)$/gm, `: ${JSON_STRING}"$1"${RESET}$2`)
			.replace(/:\s*(\d+\.?\d*)(,?)$/gm, `: ${JSON_NUMBER}$1${RESET}$2`)
			.replace(/:\s*(true|false)(,?)$/gm, `: ${JSON_BOOL}$1${RESET}$2`)
			.replace(/:\s*(null)(,?)$/gm, `: ${JSON_NULL}$1${RESET}$2`),
	);
}

function logPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return content
		.split("\n")
		.map((line) =>
			line.replace(
				/^(\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\])/,
				`${LOG_TIMESTAMP}$1${RESET}`,
			),
		);
}

function defaultPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return content.split("\n");
}

const prettifiers: Record<string, Prettifier> = {
	"report.md": markdownPrettifier,
	"transcript.md": markdownPrettifier,
	"prompt.rendered.md": markdownPrettifier,
	"log.txt": logPrettifier,
	"meta.yaml": metaPrettifier,
	"vars.json": jsonPrettifier,
	"response.json": jsonPrettifier,
};

export function getReportLines(
	run: RunRecord,
	width = 40,
	activeTab = 0,
): string[] {
	const fileName = RUN_TABS[activeTab] ?? "report.md";
	const prettify = prettifiers[fileName] ?? defaultPrettifier;

	const filePath = join(run.dir, fileName);
	const content = existsSync(filePath)
		? readFileSync(filePath, "utf-8")
		: `No ${fileName} available.`;

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
			? `Last check: ${formatTime(group.lastCheck)} ${DIM}(${formatAgo(Date.parse(group.lastCheck))})${RESET}`
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
	const rightHeader =
		cursorLine?.type === "run"
			? ` ${renderTabBar(state.activeTab)}`
			: ` ${BOLD}Task Info${RESET}`;
	const leftHeader = ` ${BOLD}${botName}${RESET} — ${state.groups.length} tasks`;
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

	const reportLines = getRightPaneLines(state, lines, cols);

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
	const bottomHeader =
		cursorLine?.type === "run"
			? renderTabBar(state.activeTab)
			: `${BOLD}Task Info${RESET}`;
	process.stdout.write(`${DIM}${"─".repeat(cols)}${RESET} ${bottomHeader}\n`);

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
