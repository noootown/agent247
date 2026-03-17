import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { loadGlobalVars } from "../lib/config.js";
import { listRuns, type RunRecord, updateRunMeta } from "../lib/report.js";

const DIM = "\x1B[2m";
const BOLD = "\x1B[1m";
const RESET = "\x1B[0m";
const SELECT_BG = "\x1B[22m\x1B[30m\x1B[46m"; // black text on cyan bg (22m resets bold)
const CYAN = "\x1B[36m";
const RED = "\x1B[31m";
const YELLOW = "\x1B[33m";
const GREEN = "\x1B[32m";
const MAGENTA = "\x1B[35m";

interface TaskGroup {
	task: string;
	runs: RunRecord[];
	expanded: boolean;
}

type ViewMode = "list" | "detail" | "help";

interface State {
	groups: TaskGroup[];
	cursor: number;
	scroll: number;
	mode: ViewMode;
	detailRun: RunRecord | null;
	detailScroll: number;
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
		detailRun: null,
		detailScroll: 0,
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

	function statusIcon(status: string, bg?: string): string {
		const reset = bg ?? RESET;
		switch (status) {
			case "error":
				return `${RED}✗${reset}`;
			case "pending":
				return `${YELLOW}◎${reset}`;
			case "completed":
				return `${GREEN}●${reset}`;
			case "skipped":
				return `${DIM}○${reset}`;
			default:
				return "○";
		}
	}

	function statusText(status: string, bg?: string): string {
		const reset = bg ?? RESET;
		const padded = status.padEnd(10);
		switch (status) {
			case "error":
				return `${RED}${padded}${reset}`;
			case "pending":
				return `${YELLOW}${padded}${reset}`;
			case "completed":
				return `${GREEN}${padded}${reset}`;
			case "skipped":
				return `${DIM}${padded}${reset}`;
			default:
				return padded;
		}
	}

	function taskSummary(group: TaskGroup, bg?: string): string {
		const reset = bg ?? RESET;
		const total = group.runs.length;
		const errors = group.runs.filter((r) => r.meta.status === "error").length;
		const pending = group.runs.filter(
			(r) => r.meta.status === "pending",
		).length;
		const completed = group.runs.filter(
			(r) => r.meta.status === "completed",
		).length;

		const parts: string[] = [`${total} runs`];
		if (completed > 0) parts.push(`${GREEN}${completed} completed${reset}`);
		if (pending > 0) parts.push(`${YELLOW}${pending} pending${reset}`);
		if (errors > 0) parts.push(`${RED}${errors} error${reset}`);
		return parts.join(", ");
	}

	function renderList(): void {
		const rows = process.stdout.rows ?? 24;
		const cols = process.stdout.columns ?? 80;
		const lines = getVisibleLines();
		const maxVisible = rows - 5;

		if (state.cursor >= 0) {
			if (state.cursor < state.scroll) state.scroll = state.cursor;
			if (state.cursor >= state.scroll + maxVisible)
				state.scroll = state.cursor - maxVisible + 1;
		}

		if (lines.length > 0 && state.cursor >= lines.length)
			state.cursor = lines.length - 1;

		process.stdout.write("\x1B[2J\x1B[H");

		process.stdout.write(
			`\n  ${BOLD}${botName}${RESET} — ${state.groups.length} tasks\n\n`,
		);

		const visible = lines.slice(state.scroll, state.scroll + maxVisible);
		for (const line of visible) {
			const selected = line.index === state.cursor;

			if (line.type === "group") {
				const arrow = line.group.expanded ? "▼" : "▶";
				if (selected) {
					const plain = `  ${arrow} ${line.group.task}  (${stripAnsi(taskSummary(line.group))})`;
					const padded = plain.padEnd(cols);
					process.stdout.write(`${SELECT_BG}${padded}${RESET}\n`);
				} else {
					const text = `  ${arrow} ${BOLD}${MAGENTA}${line.group.task}${RESET}  (${taskSummary(line.group)})`;
					process.stdout.write(`${text}\n`);
				}
			} else {
				const time = formatTime(line.run.meta.started_at);
				const rawUrl = line.run.meta.url;
				const hasUrl = rawUrl?.startsWith("http");
				const link = hasUrl ? `\x1B]8;;${rawUrl}\x07[Link]\x1B]8;;\x07` : "—";
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
					const text = `      ${plainIcon} ${status}  ${time}  ${link}`;
					const padded = stripAnsi(text).padEnd(cols);
					process.stdout.write(`${SELECT_BG}${padded}${RESET}\n`);
				} else {
					const icon = statusIcon(line.run.meta.status);
					const status = statusText(line.run.meta.status);
					const BLUE = "\x1B[94m";
					const coloredLink = hasUrl
						? `${BLUE}${link}${RESET}`
						: `${DIM}—${RESET}`;
					const text = `      ${icon} ${status}  ${time}  ${coloredLink}`;
					process.stdout.write(`${text}\n`);
				}
			}
		}

		const footerY = rows;
		process.stdout.write(`\x1B[${footerY};1H`);
		process.stdout.write(`  ${DIM}h help  q quit${RESET}`);
	}

	function renderDetail(): void {
		const rows = process.stdout.rows ?? 24;
		const run = state.detailRun;
		if (!run) return;

		process.stdout.write("\x1B[2J\x1B[H");

		const header = [
			"",
			`  ${BOLD}Run: ${run.meta.id}${RESET}`,
			`  Task: ${CYAN}${run.meta.task}${RESET}`,
			`  Status: ${statusIcon(run.meta.status)} ${run.meta.status}`,
			`  Time: ${run.meta.started_at}`,
			`  Duration: ${run.meta.duration_seconds}s`,
			run.meta.url ? `  URL: ${run.meta.url}` : null,
			"",
			`  ${"─".repeat(60)}`,
			"",
		].filter((l): l is string => l !== null);

		const reportPath = join(run.dir, "report.md");
		const report = existsSync(reportPath)
			? readFileSync(reportPath, "utf-8")
			: "No report available.";
		const reportLines = report.split("\n").map((l) => `  ${l}`);

		const allLines = [...header, ...reportLines];
		const maxVisible = rows - 2;

		if (state.detailScroll > allLines.length - maxVisible)
			state.detailScroll = Math.max(0, allLines.length - maxVisible);
		if (state.detailScroll < 0) state.detailScroll = 0;

		const visible = allLines.slice(
			state.detailScroll,
			state.detailScroll + maxVisible,
		);
		for (const line of visible) {
			process.stdout.write(`${line}\n`);
		}

		const footerY = rows;
		process.stdout.write(`\x1B[${footerY};1H`);
		process.stdout.write(`  ${DIM}h help  esc/q back${RESET}`);
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
			`    Enter       Toggle group or view run detail`,
			"",
			`  ${BOLD}Actions${RESET}`,
			`    c           Mark selected run as ${GREEN}completed${RESET}`,
			`    p           Mark selected run as ${YELLOW}pending${RESET}`,
			"",
			`  ${BOLD}General${RESET}`,
			`    h           Toggle this help`,
			`    q           Quit (or back from detail)`,
			`    Esc         Back from detail / help`,
			"",
		];

		for (const line of helpLines) {
			process.stdout.write(`${line}\n`);
		}

		const footerY = rows;
		process.stdout.write(`\x1B[${footerY};1H`);
		process.stdout.write(`  ${DIM}esc/h back${RESET}`);
	}

	function render(): void {
		if (state.mode === "list") renderList();
		else if (state.mode === "detail") renderDetail();
		else renderHelp();
	}

	function handleKey(key: Buffer): void {
		const str = key.toString();
		const lines = getVisibleLines();

		if (state.mode === "help") {
			if (str === "h" || str === "\x1B" || str === "q") {
				state.mode = "list";
				render();
			}
			return;
		}

		if (state.mode === "detail") {
			if (str === "q" || str === "\x1B" || str === "\x1B[D") {
				state.mode = "list";
				state.detailRun = null;
				state.detailScroll = 0;
				render();
			} else if (str === "\x1B[A") {
				state.detailScroll = Math.max(0, state.detailScroll - 1);
				render();
			} else if (str === "\x1B[B") {
				state.detailScroll++;
				render();
			} else if (str === "c" && state.detailRun) {
				if (state.detailRun.meta.status === "pending") {
					updateRunMeta(state.detailRun.dir, { status: "completed" });
					state.detailRun.meta.status = "completed";
					render();
				}
			} else if (str === "p" && state.detailRun) {
				if (state.detailRun.meta.status === "completed") {
					updateRunMeta(state.detailRun.dir, { status: "pending" });
					state.detailRun.meta.status = "pending";
					render();
				}
			} else if (str === "h") {
				state.mode = "help";
				render();
			}
			return;
		}

		// List mode
		if (str === "q" || str === "\x03") {
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
				state.mode = "detail";
				state.detailRun = line.run;
				state.detailScroll = 0;
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
		} else if (str === "h") {
			state.mode = "help";
			render();
		}
	}

	function cleanup(): void {
		clearInterval(refreshInterval);
		process.stdin.setRawMode(false);
		process.stdin.pause();
		process.stdout.write("\x1B[?25h\x1B[?1049l"); // show cursor + leave alt screen
	}

	loadData();
	process.stdout.write("\x1B[?1049h\x1B[?25l"); // enter alt screen + hide cursor
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

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences
const ANSI_RE = /\x1B\[[0-9;]*m/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping OSC hyperlink sequences
const OSC_RE = /\x1B\]8;;[^\x07]*\x07/g;

function stripAnsi(str: string): string {
	return str.replace(ANSI_RE, "").replace(OSC_RE, "");
}
