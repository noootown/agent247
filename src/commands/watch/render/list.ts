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
	statusText,
	stripAnsi,
	YELLOW,
} from "./ansi.js";

export function renderListRow(
	line: VisibleLine,
	width: number,
	selected: boolean,
): string {
	if (line.type === "group") {
		const arrow = line.group.expanded ? "▼" : "▶";
		const statusTag = line.group.running
			? ` ${YELLOW}${SPINNER[getSpinnerFrame() % SPINNER.length]}${RESET}`
			: !line.group.enabled
				? ` ${DIM}(disabled)${RESET}`
				: "";
		if (selected) {
			const plain = ` ${arrow} ${line.group.task}${stripAnsi(statusTag)}`;
			return `${SELECT_BG}${plain.substring(0, width).padEnd(width)}${RESET}`;
		}
		const text = ` ${arrow} ${BOLD}${MAGENTA}${line.group.task}${RESET}${statusTag}`;
		return fitToWidth(text, width);
	}

	const ago = formatAgo(Date.parse(line.run.meta.started_at));
	const timeBase = formatTimeShort(line.run.meta.started_at);
	const rawUrl = line.run.meta.url;
	const hasUrl = rawUrl?.startsWith("http");
	const slug = hasUrl && rawUrl ? formatUrlSlug(rawUrl) : "—";

	if (selected) {
		const plainIcon =
			line.run.meta.status === "error"
				? "✗"
				: line.run.meta.status === "completed"
					? "●"
					: "○";
		const status = line.run.meta.status.padEnd(10);
		const plain = `    ${plainIcon} ${status} ${timeBase} (${ago})  ${slug}`;
		return `${SELECT_BG}${plain.substring(0, width).padEnd(width)}${RESET}`;
	}

	const icon = statusIcon(line.run.meta.status);
	const status = statusText(line.run.meta.status);
	const BLUE = "\x1B[94m";
	const link = hasUrl
		? `${BLUE}${hyperlink(rawUrl ?? "", slug)}${RESET}`
		: `${DIM}—${RESET}`;
	const time = `${timeBase} ${DIM}(${ago})${RESET}`;
	return fitToWidth(`    ${icon} ${status} ${time}  ${link}`, width);
}
