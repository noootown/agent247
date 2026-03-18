import { formatUrlSlug } from "../../../lib/url.js";
import type { State, TaskGroup, VisibleLine } from "../state.js";
import {
	BOLD,
	DIM,
	fitToWidth,
	formatAgo,
	formatTime,
	GREEN,
	getSpinnerFrame,
	MAGENTA,
	RED,
	RESET,
	SELECT_BG,
	SPINNER,
	statusIcon,
	statusText,
	stripAnsi,
	YELLOW,
} from "./ansi.js";

export function taskSummary(group: TaskGroup, compact = false): string {
	const scheduleLabel = group.schedule ? `${DIM}${group.schedule}${RESET}` : "";
	const statusLabel = group.running
		? `${YELLOW}${SPINNER[getSpinnerFrame() % SPINNER.length]} running${RESET}`
		: !group.enabled
			? `${DIM}disabled${RESET}`
			: scheduleLabel;

	const total = group.runs.length;
	const errors = group.runs.filter((r) => r.meta.status === "error").length;
	const pending = group.runs.filter((r) => r.meta.status === "pending").length;
	const completed = group.runs.filter(
		(r) => r.meta.status === "completed",
	).length;

	if (compact) {
		const parts: string[] = [];
		if (statusLabel) parts.push(statusLabel);
		parts.push(`${total}r`);
		if (pending > 0) parts.push(`${YELLOW}${pending}p${RESET}`);
		if (completed > 0) parts.push(`${GREEN}${completed}c${RESET}`);
		if (errors > 0) parts.push(`${RED}${errors}e${RESET}`);
		return parts.join(" ");
	}

	const lastCheckLabel = group.lastCheck
		? `${DIM}last check: ${formatAgo(Date.parse(group.lastCheck))}${RESET}`
		: "";

	const parts: string[] = [];
	if (statusLabel) parts.push(statusLabel);
	if (lastCheckLabel) parts.push(lastCheckLabel);
	parts.push(`${total} runs`);
	if (pending > 0) parts.push(`${YELLOW}${pending} pending${RESET}`);
	if (completed > 0) parts.push(`${GREEN}${completed} completed${RESET}`);
	if (errors > 0) parts.push(`${RED}${errors} error${RESET}`);
	return parts.join(", ");
}

export function renderListRow(
	line: VisibleLine,
	width: number,
	selected: boolean,
	compact = false,
): string {
	if (line.type === "group") {
		const arrow = line.group.expanded ? "▼" : "▶";
		const summary = taskSummary(line.group, compact);
		if (selected) {
			const plain = ` ${arrow} ${line.group.task}  (${stripAnsi(summary)})`;
			return `${SELECT_BG}${plain.substring(0, width).padEnd(width)}${RESET}`;
		}
		const text = ` ${arrow} ${BOLD}${MAGENTA}${line.group.task}${RESET}  (${summary})`;
		return fitToWidth(text, width);
	}

	const ago = formatAgo(Date.parse(line.run.meta.started_at));
	const timeBase = formatTime(line.run.meta.started_at);
	const rawUrl = line.run.meta.url;
	const hasUrl = rawUrl?.startsWith("http");
	const slug = hasUrl && rawUrl ? formatUrlSlug(rawUrl) : "—";

	if (selected) {
		const plainIcon =
			line.run.meta.status === "error"
				? "✗"
				: line.run.meta.status === "pending"
					? "◎"
					: line.run.meta.status === "completed"
						? "●"
						: "○";
		const status = line.run.meta.status.padEnd(10);
		const plain = `     ${plainIcon} ${status} ${timeBase} (${ago})  ${slug}`;
		return `${SELECT_BG}${plain.substring(0, width).padEnd(width)}${RESET}`;
	}

	const icon = statusIcon(line.run.meta.status);
	const status = statusText(line.run.meta.status);
	const BLUE = "\x1B[94m";
	const link = hasUrl
		? `${BLUE}\x1B]8;;${rawUrl}\x07${slug}\x1B]8;;\x07${RESET}`
		: `${DIM}—${RESET}`;
	const time = `${timeBase} ${DIM}(${ago})${RESET}`;
	return fitToWidth(`     ${icon} ${status} ${time}  ${link}`, width);
}

export function renderList(
	state: State,
	lines: VisibleLine[],
	botName: string,
): void {
	const rows = process.stdout.rows ?? 24;
	const cols = process.stdout.columns ?? 80;
	const maxVisible = rows - 3;

	let { cursor, scroll } = state;
	if (cursor >= 0) {
		if (cursor < scroll) scroll = cursor;
		if (cursor >= scroll + maxVisible) scroll = cursor - maxVisible + 1;
	}
	if (lines.length > 0 && cursor >= lines.length) cursor = lines.length - 1;

	process.stdout.write("\x1B[2J\x1B[H");
	process.stdout.write(
		` ${BOLD}${botName}${RESET} — ${state.groups.length} tasks\n`,
	);
	process.stdout.write(`${DIM}${"─".repeat(cols)}${RESET}\n`);

	const visible = lines.slice(scroll, scroll + maxVisible);
	for (let i = 0; i < maxVisible; i++) {
		const line = visible[i];
		if (line) {
			const selected = line.index === cursor;
			process.stdout.write(`${renderListRow(line, cols, selected)}\n`);
		} else {
			process.stdout.write("\n");
		}
	}
	process.stdout.write(`  ${DIM}? help  q quit${RESET}`);
}
