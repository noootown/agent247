import { execSync, spawn } from "node:child_process";
import {
	existsSync,
	mkdirSync,
	readFileSync,
	renameSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { loadGlobalVars, loadTaskConfig } from "../../lib/config.js";
import { listRuns, updateRunMeta } from "../../lib/report.js";
import { render as renderTemplate } from "../../lib/template.js";
import { syncCommand } from "../sync.js";
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
		softDelete: (runDir) => {
			const parts = runDir.split("/");
			const runId = parts[parts.length - 1];
			const task = parts[parts.length - 2];
			const dest = join(binDir, task, runId);
			mkdirSync(join(binDir, task), { recursive: true });
			renameSync(runDir, dest);
		},
		stopTask: (taskId) => {
			const lockPath = join(baseDir, "tasks", taskId, ".lock");
			try {
				const pid = Number.parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
				if (!Number.isNaN(pid)) {
					try {
						process.kill(-pid, "SIGTERM");
					} catch {
						try {
							process.kill(pid, "SIGTERM");
						} catch {}
					}
				}
			} catch {}
			const runs = listRuns(runsDir, { task: taskId });
			let taskConfig: ReturnType<typeof loadTaskConfig> | null = null;
			try {
				taskConfig = loadTaskConfig(taskId, baseDir);
			} catch {}
			for (const run of runs) {
				if (run.meta.status === "processing") {
					updateRunMeta(run.dir, { status: "canceled" });
					// Run post_run hook for cleanup
					if (taskConfig?.post_run) {
						try {
							const itemPath = join(run.dir, "item.json");
							const itemVars = existsSync(itemPath)
								? JSON.parse(readFileSync(itemPath, "utf-8"))
								: {};
							const cmd = renderTemplate(
								taskConfig.post_run,
								globalVars,
								taskConfig.vars ?? {},
								itemVars,
							);
							execSync(cmd, {
								encoding: "utf-8",
								timeout: 60_000,
								shell: "/bin/bash",
								stdio: "pipe",
							});
						} catch {}
					}
				}
			}
			try {
				unlinkSync(lockPath);
			} catch {}
		},
		toggleTask: (taskId) => {
			const configPath = join(baseDir, "tasks", taskId, "config.yaml");
			if (!existsSync(configPath)) return;
			const raw = yaml.load(readFileSync(configPath, "utf-8")) as Record<
				string,
				unknown
			>;
			raw.enabled = !raw.enabled;
			writeFileSync(configPath, yaml.dump(raw));
			try {
				syncCommand(baseDir);
			} catch {}
		},
		spawnRun: (taskId) => {
			const cliEntry = process.argv.find(
				(a) => a.endsWith("cli.ts") || a.endsWith("cli.js"),
			);
			const child = cliEntry
				? spawn("npx", ["tsx", cliEntry, "run", taskId], {
						env: { ...process.env, AGENT247_BASE_DIR: baseDir },
						stdio: "ignore",
						shell: true,
					})
				: spawn("agent247", ["run", taskId], {
						env: { ...process.env, AGENT247_BASE_DIR: baseDir },
						stdio: "ignore",
						shell: true,
					});
			child.on("error", () => {});
		},
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
