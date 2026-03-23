import { spawn } from "node:child_process";
import { join } from "node:path";
import { cleanupRunsAsync } from "../../lib/cleanup.js";
import { loadGlobalVars } from "../../lib/config.js";
import { syncCommand } from "../sync.js";
import {
	makeSoftDelete,
	makeSpawnRun,
	makeStopTask,
	makeToggleTask,
} from "./context.js";
import { getVisibleLines, loadData } from "./data.js";
import { handleKey as confirmHandleKey } from "./modes/confirm.js";
import { handleKey as helpHandleKey } from "./modes/help.js";
import { handleKey as splitHandleKey } from "./modes/split.js";
import { tickSpinner } from "./render/ansi.js";
import { render } from "./render/index.js";
import { initialState, type State, type WatchContext } from "./state.js";

export function watchCommand(
	baseDir: string,
	options?: { all?: boolean },
): void {
	const runsDir = join(baseDir, "runs");
	const binDir = join(baseDir, ".bin");

	const globalVars = loadGlobalVars(baseDir);
	const botName = globalVars.bot_name ?? "agent247";

	let state: State = initialState();

	const ctx: WatchContext = {
		baseDir,
		runsDir,
		binDir,
		botName,
		reload: (s) => loadData(baseDir, runsDir, s, options),
		softDelete: makeSoftDelete(baseDir, binDir, globalVars),
		stopTask: makeStopTask(baseDir, runsDir, globalVars),
		toggleTask: makeToggleTask(baseDir),
		spawnRun: makeSpawnRun(baseDir),
		openUrl: (url) => {
			spawn("open", [url], { stdio: "ignore" });
		},
	};

	const modeHandlers = {
		split: splitHandleKey,
		"confirm-run": confirmHandleKey,
		help: helpHandleKey,
	};

	function handleInput(key: Buffer): void {
		const str = key.toString();
		// In full pane mode, q/Esc exits full mode instead of quitting
		if (
			state.mode === "split" &&
			state.fullPane &&
			(str === "q" || str === "\x1B")
		) {
			state = { ...state, fullPane: false };
			render(state, getVisibleLines(state), botName);
			return;
		}
		// Global quit
		if (
			state.mode === "split" &&
			(str === "q" || str === "\x1B" || str === "\x03")
		) {
			cleanup();
			process.exit(0);
		}
		if (str === "\x03") {
			cleanup();
			process.exit(0);
		}
		const prevMode = state.mode;
		const lines = getVisibleLines(state);
		state = modeHandlers[state.mode](str, state, lines, ctx);
		// Reload data when exiting confirm-run
		if (prevMode === "confirm-run" && state.mode === "split") {
			state = ctx.reload(state);
		}
		render(state, getVisibleLines(state), botName);
	}

	function cleanup(): void {
		clearInterval(refreshInterval);
		process.stdin.setRawMode(false);
		process.stdin.pause();
		process.stdout.write("\x1B[?25h\x1B[?1049l");
	}

	// Sync crontab on startup
	try {
		syncCommand(baseDir);
	} catch {}

	state = loadData(baseDir, runsDir, state, options);

	process.stdout.write("\x1B[?1049h\x1B[?25l");
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.on("data", handleInput);

	render(state, getVisibleLines(state), botName);

	// Run cleanup in a forked child process so it doesn't block the UI
	cleanupRunsAsync(baseDir, (cleaned) => {
		if (cleaned > 0) {
			state = ctx.reload(state);
			render(state, getVisibleLines(state), botName);
		}
	});

	let dataTickCount = 0;
	const refreshInterval = setInterval(() => {
		tickSpinner();
		dataTickCount++;
		if (dataTickCount >= 30) {
			dataTickCount = 0;
			state = ctx.reload(state);
		}
		render(state, getVisibleLines(state), botName);
	}, 100);

	process.on("SIGINT", () => {
		cleanup();
		process.exit(0);
	});
}
