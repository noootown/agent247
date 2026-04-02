import { spawn } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { cleanupRunsAsync } from "../../lib/cleanup.js";
import { loadGlobalVars } from "../../lib/config.js";
import { syncCommand } from "../sync.js";
import {
	makeSoftDelete,
	makeSpawnRerun,
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
import { loadHotkeys } from "./settings.js";
import { initialState, type State, type WatchContext } from "./state.js";

export function watchCommand(baseDir: string): void {
	const runsDir = join(baseDir, "runs");
	const binDir = join(baseDir, ".bin");

	const globalVars = loadGlobalVars(baseDir);
	const botName = globalVars.bot_name ?? "agent247";

	let state: State = initialState();

	const { hotkeys, warnings: hotkeyWarnings } = loadHotkeys(baseDir);
	if (hotkeyWarnings.length > 0) {
		state = { ...state, flash: hotkeyWarnings.join("; ") };
	}

	// Load persisted preferences
	const cachePath = join(baseDir, ".cache.json");
	try {
		const prefs = JSON.parse(readFileSync(cachePath, "utf-8"));
		if (prefs.layoutMode === "vertical" || prefs.layoutMode === "horizontal") {
			state.layoutMode = prefs.layoutMode;
		}
	} catch {}

	const ctx: WatchContext = {
		baseDir,
		runsDir,
		binDir,
		botName,
		reload: (s) => loadData(baseDir, runsDir, s),
		softDelete: makeSoftDelete(baseDir, runsDir, binDir, globalVars),
		stopTask: makeStopTask(baseDir, runsDir, globalVars),
		toggleTask: makeToggleTask(baseDir),
		spawnRun: makeSpawnRun(baseDir),
		spawnRerun: makeSpawnRerun(baseDir),
		openUrl: (url) => {
			spawn("open", [url], { stdio: "ignore" });
		},
		hotkeys,
	};

	const modeHandlers = {
		split: splitHandleKey,
		"confirm-run": confirmHandleKey,
		"confirm-rerun": confirmHandleKey,
		"confirm-stop": confirmHandleKey,
		"confirm-delete": confirmHandleKey,
		help: helpHandleKey,
	};

	function handleInput(key: Buffer): void {
		if (state.flash) state = { ...state, flash: null };
		const str = key.toString();
		// In full pane mode, q/Esc exits full mode instead of quitting
		if (
			state.mode === "split" &&
			state.fullPane &&
			(str === "q" || str === "\x1B")
		) {
			state = { ...state, fullPane: false };
			render(state, getVisibleLines(state), botName, ctx.hotkeys);
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
		const prevLayout = state.layoutMode;
		const lines = getVisibleLines(state);
		state = modeHandlers[state.mode](str, state, lines, ctx);
		// Persist layout preference when it changes
		if (state.layoutMode !== prevLayout) {
			try {
				const prefs = existsSync(cachePath)
					? JSON.parse(readFileSync(cachePath, "utf-8"))
					: {};
				prefs.layoutMode = state.layoutMode;
				writeFileSync(cachePath, JSON.stringify(prefs, null, 2));
			} catch {}
		}
		// Reload data when exiting confirm dialogs
		if (
			(prevMode === "confirm-run" ||
				prevMode === "confirm-rerun" ||
				prevMode === "confirm-stop" ||
				prevMode === "confirm-delete") &&
			state.mode === "split"
		) {
			state = ctx.reload(state);
		}
		render(state, getVisibleLines(state), botName, ctx.hotkeys);
	}

	function cleanup(): void {
		clearInterval(refreshInterval);
		process.stdin.setRawMode(false);
		process.stdin.pause();
		process.stdout.write("\x1B[?25h\x1B[?1049l");
	}

	// Sync crontab on startup (quiet to avoid leaking build output into TUI)
	try {
		syncCommand(baseDir, true);
	} catch {}

	state = loadData(baseDir, runsDir, state);

	process.stdout.write("\x1B[?1049h\x1B[?25l");
	process.stdin.setRawMode(true);
	process.stdin.resume();
	process.stdin.on("data", handleInput);

	render(state, getVisibleLines(state), botName, ctx.hotkeys);

	// Run cleanup in a forked child process so it doesn't block the UI
	cleanupRunsAsync(baseDir, (cleaned) => {
		if (cleaned > 0) {
			state = ctx.reload(state);
			render(state, getVisibleLines(state), botName, ctx.hotkeys);
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
		render(state, getVisibleLines(state), botName, ctx.hotkeys);
	}, 100);

	process.on("SIGINT", () => {
		cleanup();
		process.exit(0);
	});
}
