import { formatUrlSlug } from "../../../lib/url.js";
import type { VisibleLine } from "../state.js";
import {
	BOLD,
	DIM,
	fitToWidth,
	formatAgo,
	formatTimeShort,
	getSpinnerFrame,
	hyperlink,
	MAGENTA,
	RESET,
	SELECT_BG,
	SPINNER,
	statusIcon,
	statusPlainIcon,
	statusText,
	stripAnsi,
	YELLOW,
} from "./ansi.js";

const MULTI_SELECT_BG = "\x1B[48;5;236m"; // dark grey background

export function renderListRow(
	line: VisibleLine,
	width: number,
	selected: boolean,
	multiSelected = false,
): string {
	if (line.type === "group") {
		const arrow = line.group.expanded ? "▼" : "▶";
		const statusTag = line.group.running
			? ` ${YELLOW}${SPINNER[getSpinnerFrame() % SPINNER.length]}${RESET}`
			: "";
		const dimmed = !line.group.cron_enabled && !line.group.running;
		if (selected) {
			const plain = ` ${arrow} ${line.group.task}${stripAnsi(statusTag)}`;
			return `${SELECT_BG}${plain.substring(0, width).padEnd(width)}${RESET}`;
		}
		const text = dimmed
			? ` ${arrow} ${DIM}${line.group.task}${RESET}`
			: ` ${arrow} ${BOLD}${MAGENTA}${line.group.task}${RESET}${statusTag}`;
		return fitToWidth(text, width);
	}

	const ago = formatAgo(Date.parse(line.run.meta.started_at));
	const timeBase = formatTimeShort(line.run.meta.started_at);
	const rawUrl = line.run.meta.url;
	const hasUrl = rawUrl?.startsWith("http");
	const slug = hasUrl && rawUrl ? formatUrlSlug(rawUrl) : "—";

	const mark = line.run.meta.marked ? "* " : "  ";

	if (selected) {
		const plainIcon = statusPlainIcon(line.run.meta.status);
		const status = line.run.meta.status.padEnd(10);
		const plain = `  ${mark}${plainIcon} ${status} ${timeBase} (${ago})  ${slug}`;
		return `${SELECT_BG}${plain.substring(0, width).padEnd(width)}${RESET}`;
	}

	if (multiSelected) {
		const plainIcon = statusPlainIcon(line.run.meta.status);
		const status = line.run.meta.status.padEnd(10);
		const plain = `  ${mark}${plainIcon} ${status} ${timeBase} (${ago})  ${slug}`;
		return `${MULTI_SELECT_BG}${plain.substring(0, width).padEnd(width)}${RESET}`;
	}

	const icon = statusIcon(line.run.meta.status);
	const status = statusText(line.run.meta.status);
	const BLUE = "\x1B[94m";
	const link = hasUrl
		? `${BLUE}${hyperlink(rawUrl ?? "", slug)}${RESET}`
		: `${DIM}—${RESET}`;
	const time = `${timeBase} ${DIM}(${ago})${RESET}`;
	const markIcon = line.run.meta.marked ? `${YELLOW}*${RESET} ` : "  ";
	return fitToWidth(`  ${markIcon}${icon} ${status} ${time}  ${link}`, width);
}
