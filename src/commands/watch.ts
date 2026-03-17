import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadGlobalVars } from "../lib/config.js";
import { listRuns, type RunRecord, updateRunMeta } from "../lib/report.js";
import { formatUrlSlug } from "../lib/url.js";

const DIM = "\x1B[2m";
const BOLD = "\x1B[1m";
const RESET = "\x1B[0m";
const SELECT_BG = "\x1B[22m\x1B[30m\x1B[46m"; // black text on cyan bg
const RED = "\x1B[31m";
const YELLOW = "\x1B[33m";
const GREEN = "\x1B[32m";
const MAGENTA = "\x1B[35m";
const SEPARATOR = "\x1B[90m│\x1B[0m"; // dim vertical bar

interface TaskGroup {
	task: string;
	runs: RunRecord[];
	expanded: boolean;
}

type ViewMode = "list" | "split" | "help";

interface State {
	groups: TaskGroup[];
	cursor: number;
	scroll: number;
	mode: ViewMode;
	splitRun: RunRecord | null;
	reportScroll: number;
	reportScrollX: number;
}

export function watchCommand(
	baseDir: string,
	options?: { all?: boolean },
): void {
	const runsDir = join(baseDir, "runs");
	const globalVars = loadGlobalVars(baseDir);
	const botName = globalVars.bot_name ?? "agent247";

	const state: State = {
		groups: [],
		cursor: -1,
		scroll: 0,
		mode: "list",
		splitRun: null,
		reportScroll: 0,
		reportScrollX: 0,
	};

	function loadData(): void {
		let runs = listRuns(runsDir);
		if (!options?.all) {
			runs = runs.filter((r) => r.meta.status !== "skipped");
		}
		runs.sort((a, b) => b.meta.id.localeCompare(a.meta.id));

		const taskMap = new Map<string, RunRecord[]>();
		for (const run of runs) {
			const existing = taskMap.get(run.meta.task) ?? [];
			existing.push(run);
			taskMap.set(run.meta.task, existing);
		}

		const prevExpanded = new Set(
			state.groups.filter((g) => g.expanded).map((g) => g.task),
		);

		state.groups = [...taskMap.entries()]
			.sort(([a], [b]) => a.localeCompare(b))
			.map(([task, taskRuns]) => ({
				task,
				runs: taskRuns,
				expanded: prevExpanded.has(task),
			}));
	}

	function getVisibleLines(): Array<
		| { type: "group"; group: TaskGroup; index: number }
		| { type: "run"; run: RunRecord; group: TaskGroup; index: number }
	> {
		const lines: Array<
			| { type: "group"; group: TaskGroup; index: number }
			| { type: "run"; run: RunRecord; group: TaskGroup; index: number }
		> = [];
		let idx = 0;
		for (const group of state.groups) {
			lines.push({ type: "group", group, index: idx++ });
			if (group.expanded) {
				for (const run of group.runs) {
					lines.push({ type: "run", run, group, index: idx++ });
				}
			}
		}
		return lines;
	}

	function statusIcon(status: string): string {
		switch (status) {
			case "error":
				return `${RED}✗${RESET}`;
			case "pending":
				return `${YELLOW}◎${RESET}`;
			case "completed":
				return `${GREEN}●${RESET}`;
			case "skipped":
				return `${DIM}○${RESET}`;
			default:
				return "○";
		}
	}

	function statusText(status: string): string {
		const padded = status.padEnd(10);
		switch (status) {
			case "error":
				return `${RED}${padded}${RESET}`;
			case "pending":
				return `${YELLOW}${padded}${RESET}`;
			case "completed":
				return `${GREEN}${padded}${RESET}`;
			case "skipped":
				return `${DIM}${padded}${RESET}`;
			default:
				return padded;
		}
	}

	function taskSummary(group: TaskGroup, compact = false): string {
		const total = group.runs.length;
		const errors = group.runs.filter((r) => r.meta.status === "error").length;
		const pending = group.runs.filter(
			(r) => r.meta.status === "pending",
		).length;
		const completed = group.runs.filter(
			(r) => r.meta.status === "completed",
		).length;

		if (compact) {
			const parts: string[] = [`${total}r`];
			if (pending > 0) parts.push(`${YELLOW}${pending}p${RESET}`);
			if (completed > 0) parts.push(`${GREEN}${completed}c${RESET}`);
			if (errors > 0) parts.push(`${RED}${errors}e${RESET}`);
			return parts.join(" ");
		}

		const parts: string[] = [`${total} runs`];
		if (pending > 0) parts.push(`${YELLOW}${pending} pending${RESET}`);
		if (completed > 0) parts.push(`${GREEN}${completed} completed${RESET}`);
		if (errors > 0) parts.push(`${RED}${errors} error${RESET}`);
		return parts.join(", ");
	}

	function getReportLines(run: RunRecord): string[] {
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
		return [...header, ...report.split("\n")];
	}

	function fitToWidth(text: string, width: number): string {
		const visible = stripAnsi(text);
		if (visible.length <= width) {
			return text + " ".repeat(width - visible.length);
		}
		// Truncate: walk the original string, counting visible chars
		let visCount = 0;
		let i = 0;
		// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI/OSC sequences
		const ansiPattern = /\x1B\[[0-9;]*m|\x1B\]8;;[^\x07]*\x07/g;
		let result = "";
		while (i < text.length && visCount < width - 1) {
			ansiPattern.lastIndex = i;
			const match = ansiPattern.exec(text);
			if (match && match.index === i) {
				result += match[0];
				i += match[0].length;
			} else {
				result += text[i];
				visCount++;
				i++;
			}
		}
		return `${result}…${RESET}`;
	}

	function renderListRow(
		line: ReturnType<typeof getVisibleLines>[number],
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

	function renderList(): void {
		const rows = process.stdout.rows ?? 24;
		const cols = process.stdout.columns ?? 80;
		const lines = getVisibleLines();
		const maxVisible = rows - 3; // header + separator + footer

		if (state.cursor >= 0) {
			if (state.cursor < state.scroll) state.scroll = state.cursor;
			if (state.cursor >= state.scroll + maxVisible)
				state.scroll = state.cursor - maxVisible + 1;
		}

		if (lines.length > 0 && state.cursor >= lines.length)
			state.cursor = lines.length - 1;

		process.stdout.write("\x1B[2J\x1B[H");

		process.stdout.write(
			` ${BOLD}${botName}${RESET} — ${state.groups.length} tasks\n`,
		);
		process.stdout.write(`${DIM}${"─".repeat(cols)}${RESET}\n`);

		const visible = lines.slice(state.scroll, state.scroll + maxVisible);
		for (const line of visible) {
			const selected = line.index === state.cursor;
			const row = renderListRow(line, cols, selected);
			process.stdout.write(`${row}\n`);
		}

		const footerY = rows;
		process.stdout.write(`\x1B[${footerY};1H`);
		process.stdout.write(`  ${DIM}? help  q quit${RESET}`);
	}

	function renderSplit(): void {
		const rows = process.stdout.rows ?? 24;
		const cols = process.stdout.columns ?? 80;
		const lines = getVisibleLines();
		const leftWidth = Math.floor(cols * 0.4);
		const rightWidth = cols - leftWidth - 1;
		const contentRows = rows - 3; // header separator + footer

		if (state.cursor >= 0) {
			if (state.cursor < state.scroll) state.scroll = state.cursor;
			if (state.cursor >= state.scroll + contentRows)
				state.scroll = state.cursor - contentRows + 1;
		}

		if (lines.length > 0 && state.cursor >= lines.length)
			state.cursor = lines.length - 1;

		const reportLines = state.splitRun
			? getReportLines(state.splitRun)
			: ["Select a run to view its report."];

		if (state.reportScroll > reportLines.length - contentRows)
			state.reportScroll = Math.max(0, reportLines.length - contentRows);
		if (state.reportScroll < 0) state.reportScroll = 0;

		const visibleReport = reportLines.slice(
			state.reportScroll,
			state.reportScroll + contentRows,
		);

		process.stdout.write("\x1B[2J\x1B[H");

		// Header separator
		const leftHeader = ` ${BOLD}${botName}${RESET} — ${state.groups.length} tasks`;
		const rightHeader = ` ${BOLD}Report${RESET}`;
		const leftHeaderPad = " ".repeat(
			Math.max(0, leftWidth - stripAnsi(leftHeader).length),
		);
		process.stdout.write(
			`${leftHeader}${leftHeaderPad}${SEPARATOR}${rightHeader}\n`,
		);
		process.stdout.write(
			`${DIM}${"─".repeat(leftWidth)}┼${"─".repeat(rightWidth)}${RESET}\n`,
		);

		// Content
		const visibleList = lines.slice(state.scroll, state.scroll + contentRows);
		for (let i = 0; i < contentRows; i++) {
			const listLine = visibleList[i];
			const reportLine = visibleReport[i] ?? "";

			// Left pane
			let left: string;
			if (listLine) {
				const selected = listLine.index === state.cursor;
				left = renderListRow(listLine, leftWidth, selected, true);
			} else {
				left = " ".repeat(leftWidth);
			}
			const leftLen = stripAnsi(left).length;
			if (leftLen < leftWidth) {
				left += " ".repeat(leftWidth - leftLen);
			}

			// Right pane — use plain text for scroll/truncation, colored for display
			const plainRight = ` ${stripAnsi(reportLine)}`;
			const colorRight = ` ${reportLine}`;
			let right: string;
			if (state.reportScrollX > 0 && plainRight.length <= state.reportScrollX) {
				right = "";
			} else if (state.reportScrollX > 0) {
				const scrolledPlain = plainRight.substring(state.reportScrollX);
				right =
					scrolledPlain.length > rightWidth
						? `${scrolledPlain.substring(0, rightWidth - 1)}…`
						: scrolledPlain;
			} else {
				const visLen = stripAnsi(colorRight).length;
				if (visLen > rightWidth) {
					right = fitToWidth(colorRight, rightWidth);
				} else {
					right = colorRight;
				}
			}

			process.stdout.write(`${left}${SEPARATOR}${right}\n`);
		}

		// Footer
		const footerY = rows;
		process.stdout.write(`\x1B[${footerY};1H`);
		process.stdout.write(
			`  ${DIM}↑↓ list  wasd report  ? help  q back${RESET}`,
		);
	}

	function renderHelp(): void {
		const rows = process.stdout.rows ?? 24;
		process.stdout.write("\x1B[2J\x1B[H");

		const helpLines = [
			"",
			`  ${BOLD}Keybindings${RESET}`,
			"",
			`  ${BOLD}Navigation${RESET}`,
			`    ↑ / ↓       Move selection up / down`,
			`    ← / →       Collapse / expand task group`,
			`    Enter       Toggle group or open split view`,
			`    w/a/s/d     Scroll report pane (up/left/down/right)`,
			"",
			`  ${BOLD}Actions${RESET}`,
			`    c           Mark selected run as ${GREEN}completed${RESET}`,
			`    p           Mark selected run as ${YELLOW}pending${RESET}`,
			"",
			`  ${BOLD}General${RESET}`,
			`    ?           Toggle this help`,
			`    q           Quit`,
			`    Esc         Back from split / help`,
			"",
		];

		for (const line of helpLines) {
			process.stdout.write(`${line}\n`);
		}

		const footerY = rows;
		process.stdout.write(`\x1B[${footerY};1H`);
		process.stdout.write(`  ${DIM}esc/q/? back${RESET}`);
	}

	function render(): void {
		if (state.mode === "list") renderList();
		else if (state.mode === "split") renderSplit();
		else renderHelp();
	}

	function updateSplitRun(): void {
		const lines = getVisibleLines();
		const line = lines[state.cursor];
		if (line?.type === "run") {
			state.splitRun = line.run;
		} else {
			state.splitRun = null;
		}
		state.reportScroll = 0;
		state.reportScrollX = 0;
	}

	function handleKey(key: Buffer): void {
		const str = key.toString();
		const lines = getVisibleLines();

		if (state.mode === "help") {
			if (str === "?" || str === "\x1B" || str === "q") {
				state.mode = state.splitRun ? "split" : "list";
				render();
			}
			return;
		}

		if (state.mode === "split") {
			if (str === "\x1B" || str === "q") {
				state.mode = "list";
				state.splitRun = null;
				state.reportScroll = 0;
				render();
			} else if (str === "\x03") {
				cleanup();
				process.exit(0);
			} else if (str === "\x1B[A") {
				// Arrow up — navigate list
				if (state.cursor <= 0) {
					state.cursor = lines.length - 1;
				} else {
					state.cursor--;
				}
				updateSplitRun();
				render();
			} else if (str === "\x1B[B") {
				// Arrow down — navigate list
				if (state.cursor < 0 || state.cursor >= lines.length - 1) {
					state.cursor = 0;
				} else {
					state.cursor++;
				}
				updateSplitRun();
				render();
			} else if (str === "\x1B[C") {
				const line = lines[state.cursor];
				if (line?.type === "group") {
					line.group.expanded = true;
					render();
				}
			} else if (str === "\x1B[D") {
				const line = lines[state.cursor];
				if (line?.type === "group") {
					line.group.expanded = false;
					render();
				} else if (line?.type === "run") {
					state.mode = "list";
					state.splitRun = null;
					state.reportScroll = 0;
					state.reportScrollX = 0;
					render();
				}
			} else if (str === "w") {
				// Scroll report up
				state.reportScroll = Math.max(0, state.reportScroll - 1);
				render();
			} else if (str === "s") {
				// Scroll report down
				state.reportScroll++;
				render();
			} else if (str === "a") {
				// Scroll report left
				state.reportScrollX = Math.max(0, state.reportScrollX - 4);
				render();
			} else if (str === "d") {
				// Scroll report right, capped at longest line
				const reportLines = state.splitRun
					? getReportLines(state.splitRun)
					: [];
				const maxLen = reportLines.reduce(
					(max, l) => Math.max(max, stripAnsi(l).length),
					0,
				);
				const rightWidth =
					(process.stdout.columns ?? 80) -
					Math.floor((process.stdout.columns ?? 80) * 0.4) -
					1;
				state.reportScrollX = Math.min(
					state.reportScrollX + 4,
					Math.max(0, maxLen - rightWidth + 1),
				);
				render();
			} else if (str === "\r") {
				const line = lines[state.cursor];
				if (line?.type === "group") {
					line.group.expanded = !line.group.expanded;
					render();
				}
			} else if (str === "c") {
				const line = lines[state.cursor];
				if (line?.type === "run" && line.run.meta.status === "pending") {
					updateRunMeta(line.run.dir, { status: "completed" });
					line.run.meta.status = "completed";
					render();
				}
			} else if (str === "p") {
				const line = lines[state.cursor];
				if (line?.type === "run" && line.run.meta.status === "completed") {
					updateRunMeta(line.run.dir, { status: "pending" });
					line.run.meta.status = "pending";
					render();
				}
			} else if (str === "?") {
				state.mode = "help";
				render();
			}
			return;
		}

		// List mode
		if (str === "q" || str === "\x1B" || str === "\x03") {
			cleanup();
			process.exit(0);
		} else if (str === "\x1B[A") {
			if (state.cursor <= 0) {
				state.cursor = lines.length - 1;
			} else {
				state.cursor--;
			}
			render();
		} else if (str === "\x1B[B") {
			if (state.cursor < 0 || state.cursor >= lines.length - 1) {
				state.cursor = 0;
			} else {
				state.cursor++;
			}
			render();
		} else if (str === "\x1B[C") {
			const line = lines[state.cursor];
			if (line?.type === "group") {
				line.group.expanded = true;
				render();
			} else if (line?.type === "run") {
				state.mode = "split";
				state.splitRun = line.run;
				state.reportScroll = 0;
				state.reportScrollX = 0;
				render();
			}
		} else if (str === "\x1B[D") {
			const line = lines[state.cursor];
			if (line?.type === "group") {
				line.group.expanded = false;
				render();
			}
		} else if (str === "\r") {
			const line = lines[state.cursor];
			if (line?.type === "run") {
				state.mode = "split";
				state.splitRun = line.run;
				state.reportScroll = 0;
				state.reportScrollX = 0;
				render();
			} else if (line?.type === "group") {
				line.group.expanded = !line.group.expanded;
				render();
			}
		} else if (str === "c") {
			const line = lines[state.cursor];
			if (line?.type === "run" && line.run.meta.status === "pending") {
				updateRunMeta(line.run.dir, { status: "completed" });
				line.run.meta.status = "completed";
				render();
			}
		} else if (str === "p") {
			const line = lines[state.cursor];
			if (line?.type === "run" && line.run.meta.status === "completed") {
				updateRunMeta(line.run.dir, { status: "pending" });
				line.run.meta.status = "pending";
				render();
			}
		} else if (str === "?") {
			state.mode = "help";
			render();
		}
	}

	function cleanup(): void {
		clearInterval(refreshInterval);
		process.stdin.setRawMode(false);
		process.stdin.pause();
		process.stdout.write("\x1B[?25h\x1B[?1049l");
	}

	loadData();
	process.stdout.write("\x1B[?1049h\x1B[?25l");
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.on("data", handleKey);

	render();

	const refreshInterval = setInterval(() => {
		loadData();
		render();
	}, 10_000);

	process.on("SIGINT", () => {
		cleanup();
		process.exit(0);
	});
}

function formatTime(iso: string): string {
	const d = new Date(iso);
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hour = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	return `${month}/${day} ${hour}:${min}`;
}

function formatAgo(timestamp: number): string {
	const diff = Math.round((Date.now() - timestamp) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
	return `${Math.round(diff / 86400)}d ago`;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences
const ANSI_RE = /\x1B\[[0-9;]*m/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping OSC hyperlink sequences
const OSC_RE = /\x1B\]8;;[^\x07]*\x07/g;

function stripAnsi(str: string): string {
	return str.replace(ANSI_RE, "").replace(OSC_RE, "");
}
