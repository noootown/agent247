import {
	existsSync,
	mkdirSync,
	readdirSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import { purgeBin } from "../lib/bin.js";
import { cleanupRuns } from "../lib/cleanup.js";
import { loadGlobalVars, loadTaskConfig } from "../lib/config.js";
import { filterNewItems } from "../lib/dedup.js";
import { discoverItems } from "../lib/discovery.js";
import { execHook } from "../lib/hooks.js";
import { acquireLock, releaseLock } from "../lib/lock.js";
import { createLogger } from "../lib/logger.js";
import { listRuns, type RunMeta, writeRun } from "../lib/report.js";
import {
	executePrompt,
	extractTextFromJson,
	parseClaudeOutput,
} from "../lib/runner.js";
import { render } from "../lib/template.js";

function buildRunMeta(
	runId: string,
	taskId: string,
	status: RunMeta["status"],
	startedAt: string,
	finishedAt: string,
	exitCode: number,
	itemKey?: string | null,
	url?: string | null,
): RunMeta {
	return {
		schema_version: 1,
		id: runId,
		task: taskId,
		status,
		url: url ?? null,
		item_key: itemKey ?? null,
		started_at: startedAt,
		finished_at: finishedAt,
		duration_seconds: Math.round(
			(Date.parse(finishedAt) - Date.parse(startedAt)) / 1000,
		),
		exit_code: exitCode,
	};
}

function loadInjectVars(
	taskId: string,
	baseDir: string,
): Record<string, string> {
	const injectDir = join(baseDir, "tasks", taskId, "inject");
	if (!existsSync(injectDir)) return {};
	const vars: Record<string, string> = {};
	for (const dirent of readdirSync(injectDir, { withFileTypes: true })) {
		if (!dirent.isFile()) continue;
		if (!dirent.name.endsWith(".md")) continue;
		const key = dirent.name.slice(0, -3);
		try {
			vars[key] = readFileSync(join(injectDir, dirent.name), "utf-8");
		} catch (err) {
			console.warn(`loadInjectVars: skipping ${dirent.name}: ${err}`);
		}
	}
	return vars;
}

function runDirName(id: string): string {
	const now = new Date();
	const ts = now
		.toISOString()
		.replace(/[-:T]/g, "")
		.replace(/\.\d+Z$/, "");
	return `${ts.slice(0, 8)}-${ts.slice(8)}-${id}`;
}

export async function runCommand(
	taskId: string,
	baseDir: string,
): Promise<void> {
	purgeBin(baseDir);
	const runsDir = join(baseDir, "runs");
	const startedAt = new Date().toISOString();

	if (!acquireLock(taskId, baseDir)) {
		console.log(`Task ${taskId} is already running, skipping.`);
		return;
	}

	const config = loadTaskConfig(taskId, baseDir);
	const globalVars = loadGlobalVars(baseDir);

	try {
		let items: Record<string, string>[];
		if (config.discovery) {
			try {
				const discoveryCmd = render(
					config.discovery.command,
					globalVars,
					config.vars ?? {},
				);
				// Pass globalVars as env so discovery scripts can read secrets
				// without them appearing in CLI args (e.g., LINEAR_API_KEY)
				const discoveryEnv = Object.fromEntries(
					Object.entries(globalVars).map(([k, v]) => [k.toUpperCase(), v]),
				);
				items = discoverItems(discoveryCmd, discoveryEnv, baseDir);
			} catch (err) {
				const runId = ulid();
				const runDir = join(runsDir, taskId, runDirName(runId));
				const logger = createLogger(join(runDir, "log.txt"));
				logger.error(`Discovery failed: ${err}`);
				writeRun(runDir, {
					meta: buildRunMeta(
						runId,
						taskId,
						"error",
						startedAt,
						new Date().toISOString(),
						1,
					),
					log: logger.getEntries().join("\n"),
				});
				console.error(`Discovery failed for ${taskId}: ${err}`);
				return;
			}
		} else {
			// No discovery configured — run once with an empty item
			items = [{}];
		}

		const newItems = filterNewItems(
			runsDir,
			taskId,
			items,
			config.discovery?.item_key ?? "",
			{ bypassDedup: config.discovery ? config.bypass_dedup : true },
		);

		if (newItems.length === 0) {
			const runId = ulid();
			const binDir = join(baseDir, ".bin", taskId, runDirName(runId));
			const finishedAt = new Date().toISOString();
			const logger = createLogger(join(binDir, "log.txt"));
			logger.log(
				`No new items for ${taskId} (${items.length} discovered, all deduped)`,
			);
			writeRun(binDir, {
				meta: buildRunMeta(runId, taskId, "skipped", startedAt, finishedAt, 0),
				log: logger.getEntries().join("\n"),
			});
			return;
		}

		if (config.prompt_mode === "per_item") {
			if (config.parallel) {
				await Promise.all(
					newItems.map((item) =>
						executeForItem(config, globalVars, item, runsDir, baseDir),
					),
				);
			} else {
				for (const item of newItems) {
					await executeForItem(config, globalVars, item, runsDir, baseDir);
				}
			}
		} else {
			await executeForBatch(config, globalVars, newItems, runsDir, baseDir);
		}
	} finally {
		// Cleanup: always runs, even when skipped — move completed/error runs to .bin
		if (config.cleanup) {
			const allRuns = listRuns(runsDir, { task: taskId });
			cleanupRuns(
				allRuns,
				config.cleanup,
				globalVars,
				config.vars ?? {},
				join(baseDir, ".bin"),
				taskId,
				baseDir,
			);
		}
		releaseLock(taskId, baseDir);
	}
}

function runPostHook(
	config: ReturnType<typeof loadTaskConfig>,
	globalVars: Record<string, string>,
	taskVars: Record<string, string>,
	item: Record<string, string>,
	logger: ReturnType<typeof createLogger>,
	baseDir?: string,
): void {
	if (!config.post_run) return;
	const postRunCmd = render(config.post_run, globalVars, taskVars, item);
	logger.log(`Post-run: ${postRunCmd}`);
	try {
		execHook(postRunCmd, baseDir, logger);
	} catch {
		// Swallow — error already logged by execHook
	}
}

async function executeForItem(
	config: ReturnType<typeof loadTaskConfig>,
	globalVars: Record<string, string>,
	item: Record<string, string>,
	runsDir: string,
	baseDir?: string,
): Promise<void> {
	const startedAt = new Date().toISOString();
	const runId = ulid();
	const runDir = join(runsDir, config.id, runDirName(runId));
	const taskVars = config.vars ?? {};
	const itemKey = item[config.discovery?.item_key ?? ""] ?? null;

	const logger = createLogger(join(runDir, "log.txt"));
	// Save item vars for post-run cleanup (e.g., when canceled from TUI)
	mkdirSync(runDir, { recursive: true });
	writeFileSync(join(runDir, "vars.json"), JSON.stringify(item, null, 2));
	logger.log(`Starting task: ${config.id}`);
	if (config.discovery)
		logger.log(`Item: ${item[config.discovery?.item_key ?? ""]}`);

	// Pre-run hook
	if (config.pre_run) {
		const preRunCmd = render(config.pre_run, globalVars, taskVars, item);
		logger.log(`Pre-run: ${preRunCmd}`);
		try {
			execHook(preRunCmd, baseDir, logger);
		} catch {
			const finishedAt = new Date().toISOString();
			// error already logged by execHook
			writeRun(runDir, {
				meta: buildRunMeta(
					runId,
					config.id,
					"error",
					startedAt,
					finishedAt,
					1,
					itemKey,
					itemKey,
				),
				log: logger.getEntries().join("\n"),
			});
			// Still run post_run for cleanup
			runPostHook(config, globalVars, taskVars, item, logger, baseDir);
			return;
		}
	}

	const reservedVars = loadInjectVars(config.id, baseDir ?? "");
	const renderedPrompt = render(
		config.prompt,
		globalVars,
		taskVars,
		item,
		reservedVars,
	);
	const renderedCwd = config.cwd
		? render(config.cwd, globalVars, taskVars, item)
		: undefined;

	writeFileSync(join(runDir, "prompt.rendered.md"), renderedPrompt);
	writeRun(runDir, {
		meta: buildRunMeta(
			runId,
			config.id,
			"processing",
			startedAt,
			startedAt,
			-1,
			itemKey,
			itemKey,
		),
		log: "",
	});
	logger.log(`Rendered prompt (${renderedPrompt.length} chars)`);
	if (renderedCwd) logger.log(`Working directory: ${renderedCwd}`);

	try {
		const execResult = await executePrompt(
			renderedPrompt,
			config.timeout,
			"claude",
			config.model,
			renderedCwd,
			join(runDir, "transcript.md"),
		);
		const finishedAt = new Date().toISOString();

		logger.log(
			`Process exited with code ${execResult.exitCode}${execResult.timedOut ? " (timed out)" : ""}`,
		);

		if (execResult.exitCode !== 0) {
			logger.error(`stderr: ${execResult.stderr}`);
			writeRun(runDir, {
				meta: buildRunMeta(
					runId,
					config.id,
					"error",
					startedAt,
					finishedAt,
					execResult.exitCode,
					itemKey,
					itemKey,
				),
				prompt: renderedPrompt,
				log: logger.getEntries().join("\n"),
			});
			return;
		}

		const textOutput = execResult.rawJson
			? extractTextFromJson(execResult.rawJson)
			: execResult.stdout;
		const parsed = parseClaudeOutput(textOutput);
		logger.log(`Output: ${textOutput.length} chars, status: ${parsed.status}`);

		writeRun(runDir, {
			meta: buildRunMeta(
				runId,
				config.id,
				parsed.status,
				startedAt,
				finishedAt,
				execResult.exitCode,
				itemKey,
				parsed.url ?? itemKey,
			),
			prompt: renderedPrompt,
			rawJson: execResult.rawJson ?? undefined,
			report: parsed.report,
			log: logger.getEntries().join("\n"),
		});
	} finally {
		// Post-run hook — always runs
		runPostHook(config, globalVars, taskVars, item, logger, baseDir);
	}
}

async function executeForBatch(
	config: ReturnType<typeof loadTaskConfig>,
	globalVars: Record<string, string>,
	items: Record<string, string>[],
	runsDir: string,
	baseDir?: string,
): Promise<void> {
	const startedAt = new Date().toISOString();
	const runId = ulid();
	const runDir = join(runsDir, config.id, runDirName(runId));
	const taskVars = config.vars ?? {};

	const itemsJson = JSON.stringify(items);
	const itemsList = items
		.map((i) => `- ${i[config.discovery?.item_key ?? ""]}`)
		.join("\n");
	const batchVars = { items_json: itemsJson, items_list: itemsList };

	const reservedVars = loadInjectVars(config.id, baseDir ?? "");
	const renderedPrompt = render(
		config.prompt,
		globalVars,
		taskVars,
		batchVars,
		reservedVars,
	);
	const renderedCwd = config.cwd
		? render(config.cwd, globalVars, taskVars)
		: undefined;

	const logger = createLogger(join(runDir, "log.txt"));
	writeFileSync(join(runDir, "prompt.rendered.md"), renderedPrompt);
	writeRun(runDir, {
		meta: buildRunMeta(
			runId,
			config.id,
			"processing",
			startedAt,
			startedAt,
			-1,
		),
		log: "",
	});
	logger.log(`Starting batch task: ${config.id} (${items.length} items)`);
	logger.log(`Rendered prompt (${renderedPrompt.length} chars)`);
	if (renderedCwd) logger.log(`Working directory: ${renderedCwd}`);

	const execResult = await executePrompt(
		renderedPrompt,
		config.timeout,
		"claude",
		config.model,
		renderedCwd,
		join(runDir, "transcript.md"),
	);
	const finishedAt = new Date().toISOString();

	logger.log(
		`Process exited with code ${execResult.exitCode}${execResult.timedOut ? " (timed out)" : ""}`,
	);

	if (execResult.exitCode !== 0) {
		logger.error(`stderr: ${execResult.stderr}`);
		writeRun(runDir, {
			meta: buildRunMeta(
				runId,
				config.id,
				"error",
				startedAt,
				finishedAt,
				execResult.exitCode,
			),
			prompt: renderedPrompt,
			log: logger.getEntries().join("\n"),
		});
		return;
	}

	const textOutput = execResult.rawJson
		? extractTextFromJson(execResult.rawJson)
		: execResult.stdout;
	const parsed = parseClaudeOutput(textOutput);
	logger.log(`Output: ${textOutput.length} chars, status: ${parsed.status}`);

	writeRun(runDir, {
		meta: buildRunMeta(
			runId,
			config.id,
			parsed.status,
			startedAt,
			finishedAt,
			execResult.exitCode,
			null,
			parsed.url,
		),
		prompt: renderedPrompt,
		rawJson: execResult.rawJson ?? undefined,
		report: parsed.report,
		log: logger.getEntries().join("\n"),
	});
}
