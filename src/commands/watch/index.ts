import { execSync, spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

export function watchCommand(baseDir: string): void {
	const runsDir = join(baseDir, "runs");
	const binDir = join(baseDir, ".bin");

	const globalVars = loadGlobalVars(baseDir);
	const botName = globalVars.bot_name ?? "agent247";

	let state: State = initialState();

	// Load persisted preferences
	const prefsPath = join(baseDir, ".preferences.json");
	try {
		const prefs = JSON.parse(readFileSync(prefsPath, "utf-8"));
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
		openUrl: (url) => {
			spawn("open", [url], { stdio: "ignore" });
		},
	};

	const modeHandlers = {
		split: splitHandleKey,
		"confirm-run": confirmHandleKey,
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
		const prevLayout = state.layoutMode;
		const lines = getVisibleLines(state);
		state = modeHandlers[state.mode](str, state, lines, ctx);
		// Persist layout preference when it changes
		if (state.layoutMode !== prevLayout) {
			try {
				const prefs = existsSync(prefsPath)
					? JSON.parse(readFileSync(prefsPath, "utf-8"))
					: {};
				prefs.layoutMode = state.layoutMode;
				writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
			} catch {}
		}
		// Reload data when exiting confirm dialogs
		if (
			(prevMode === "confirm-run" ||
				prevMode === "confirm-stop" ||
				prevMode === "confirm-delete") &&
			state.mode === "split"
		) {
			state = ctx.reload(state);
		}
		// Suspend mode: spawn shell or claude, restore TUI on exit
		if (state.suspend) {
			const { mode: suspendMode, cwd } = state.suspend;
			state = { ...state, suspend: null };
			// Save terminal state
			let savedStty = "";
			try {
				savedStty = execSync("stty -g", { encoding: "utf-8" }).trim();
			} catch {}
			// Suspend TUI
			process.stdin.removeListener("data", handleInput);
			process.stdin.setRawMode(false);
			process.stdout.write("\x1B[?25h\x1B[?1049l");

			if (suspendMode === "shell") {
				process.stdout.write(
					`\nShell at ${cwd}\nPress ctrl+d to return to TUI\n\n`,
				);
				const shell = process.env.SHELL ?? "/bin/zsh";
				spawnSync(shell, ["-i"], {
					stdio: "inherit",
					cwd,
					env: { ...process.env, AGENT247_SHELL: cwd },
				});
			} else {
				process.stdout.write(
					`\nClaude at ${cwd}\nPress ctrl+d to return to TUI\n\n`,
				);
				spawnSync("claude", [], {
					stdio: "inherit",
					cwd,
					env: { ...process.env, AGENT247_SHELL: cwd },
				});
			}

			// Restore terminal state
			if (savedStty) {
				try {
					execSync(`stty ${savedStty}`);
				} catch {}
			}
			// Restore TUI — reset cursor key mode (DECCKM) in case shell/claude changed it
			process.stdout.write("\x1B[?1l\x1B[?1049h\x1B[?25l");
			process.stdin.setRawMode(true);
			process.stdin.resume();
			process.stdin.on("data", handleInput);
			state = ctx.reload(state);
			render(state, getVisibleLines(state), botName);
			return;
		}
		render(state, getVisibleLines(state), botName);
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
