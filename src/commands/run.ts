import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { ulid } from "ulid";
import { purgeBin } from "../lib/bin.js";
import { cleanupRuns } from "../lib/cleanup.js";
import {
	loadEnvLocalRaw,
	loadGlobalVars,
	loadTaskConfig,
} from "../lib/config.js";
import { FILE } from "../lib/constants.js";
import { filterNewItems } from "../lib/dedup.js";
import { discoverItems } from "../lib/discovery.js";
import { execHook } from "../lib/hooks.js";
import { acquireLock, releaseLock } from "../lib/lock.js";
import { createLogger } from "../lib/logger.js";
import { isOnline } from "../lib/network.js";
import { buildSecretMap } from "../lib/redact.js";
import { listRuns, type RunMeta, writeRun } from "../lib/report.js";
import {
	executePrompt,
	extractTextFromJson,
	parseClaudeOutput,
} from "../lib/runner.js";
import { writeTaskCache } from "../lib/task-cache.js";
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
	const pad = (n: number, w = 2) => String(n).padStart(w, "0");
	const year = now.getFullYear();
	const month = pad(now.getMonth() + 1);
	const day = pad(now.getDate());
	const hour = pad(now.getHours());
	const min = pad(now.getMinutes());
	const sec = pad(now.getSeconds());
	const offsetMins = -now.getTimezoneOffset();
	const sign = offsetMins >= 0 ? "+" : "-";
	const absH = pad(Math.floor(Math.abs(offsetMins) / 60));
	const absM = pad(Math.abs(offsetMins) % 60);
	const offset = `${sign}${absH}${absM}`;
	return `${year}${month}${day}-${hour}${min}${sec}${offset}-${id}`;
}

/** Load and resolve config.yaml as a plain object for data.json */
function resolveConfig(
	config: ReturnType<typeof loadTaskConfig>,
	globalVars: Record<string, string>,
	taskVars: Record<string, string>,
	item: Record<string, string>,
	baseDir: string,
): Record<string, unknown> {
	const rawConfig = readFileSync(
		join(baseDir, "tasks", config.id, FILE.CONFIG),
		"utf-8",
	);
	const rendered = render(rawConfig, globalVars, taskVars, item);
	return (yaml.load(rendered) as Record<string, unknown>) ?? {};
}

export async function runCommand(
	taskId: string,
	baseDir: string,
	rerunItemKey?: string,
	cron?: boolean,
): Promise<void> {
	if (cron) {
		const jitter = Math.floor(Math.random() * 10000);
		await new Promise((resolve) => setTimeout(resolve, jitter));
	}
	purgeBin(baseDir);
	const runsDir = join(baseDir, "runs");
	const startedAt = new Date().toISOString();

	if (!acquireLock(taskId, baseDir)) {
		console.log(`Task ${taskId} is already running, skipping.`);
		return;
	}

	const config = loadTaskConfig(taskId, baseDir);

	if (config.requires_network && !(await isOnline())) {
		console.log(`Network unavailable, skipping task ${taskId}.`);
		releaseLock(taskId, baseDir);
		return;
	}

	const globalVars = loadGlobalVars(baseDir);
	const envLocalRaw = loadEnvLocalRaw(baseDir);
	const secrets = buildSecretMap(envLocalRaw);

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
				const logger = createLogger(join(runDir, FILE.LOG));
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
					secrets,
				});
				console.error(`Discovery failed for ${taskId}: ${err}`);
				return;
			}
		} else {
			// No discovery configured — run once with an empty item
			items = [{}];
		}

		const allDiscoveredItems = items;

		let newItems: Record<string, string>[];
		if (rerunItemKey) {
			// Rerun mode: filter to matching item, skip dedup
			const itemKeyField = config.discovery?.item_key ?? "";
			newItems = items.filter((item) => item[itemKeyField] === rerunItemKey);
			if (newItems.length === 0) {
				// Fallback: load stored vars from most recent run with this item_key
				const previousRuns = listRuns(runsDir, { task: taskId })
					.filter((r) => r.meta.item_key === rerunItemKey)
					.sort((a, b) => b.meta.id.localeCompare(a.meta.id));
				if (previousRuns.length > 0) {
					const dataPath = join(previousRuns[0].dir, FILE.DATA);
					if (existsSync(dataPath)) {
						const data = JSON.parse(readFileSync(dataPath, "utf-8"));
						const storedVars = data.vars ?? {};
						newItems = [storedVars];
					}
				}
			}
		} else {
			newItems = filterNewItems(
				runsDir,
				taskId,
				items,
				config.discovery?.item_key ?? "",
				{ bypassDedup: config.discovery ? config.bypass_dedup : true },
			);
		}

		if (newItems.length === 0) {
			writeTaskCache(runsDir, taskId, {
				last_check: new Date().toISOString(),
			});
			return;
		}

		if (config.parallel) {
			// Group items by parallel_group_by field (defaults to item_key = all parallel)
			const groupByField =
				config.parallel_group_by ?? config.discovery?.item_key ?? "";
			const groups = new Map<string, Record<string, string>[]>();
			for (const item of newItems) {
				const key = item[groupByField] ?? "";
				const group = groups.get(key) ?? [];
				group.push(item);
				groups.set(key, group);
			}
			// Run groups in parallel, items within each group sequentially
			await Promise.all(
				[...groups.values()].map(async (groupItems) => {
					for (const item of groupItems) {
						await executeForItem(
							config,
							globalVars,
							item,
							runsDir,
							baseDir,
							secrets,
							allDiscoveredItems,
						);
					}
				}),
			);
		} else {
			for (const item of newItems) {
				await executeForItem(
					config,
					globalVars,
					item,
					runsDir,
					baseDir,
					secrets,
					allDiscoveredItems,
				);
			}
		}
	} finally {
		writeTaskCache(runsDir, taskId, {
			last_check: new Date().toISOString(),
		});
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
	baseDir: string,
	secrets: Map<string, string>,
	allDiscoveredItems: Record<string, string>[],
): Promise<void> {
	const startedAt = new Date().toISOString();
	const runId = ulid();
	const runDir = join(runsDir, config.id, runDirName(runId));
	const taskVars = config.vars ?? {};
	const itemKey = item[config.discovery?.item_key ?? ""] ?? null;

	const logger = createLogger(join(runDir, FILE.LOG));
	const mergedVars = { ...globalVars, ...taskVars, ...item };
	const resolvedConfig = resolveConfig(
		config,
		globalVars,
		taskVars,
		item,
		baseDir,
	);

	// Write initial data.json with processing status
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
		config: resolvedConfig,
		vars: mergedVars,
		discovery: allDiscoveredItems,
		log: "",
		secrets,
	});
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
				config: resolvedConfig,
				vars: mergedVars,
				discovery: allDiscoveredItems,
				log: logger.getEntries().join("\n"),
				secrets,
			});
			runPostHook(config, globalVars, taskVars, item, logger, baseDir);
			return;
		}
	}

	const reservedVars = loadInjectVars(config.id, baseDir);
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
		config: resolvedConfig,
		vars: mergedVars,
		discovery: allDiscoveredItems,
		prompt: renderedPrompt,
		log: "",
		secrets,
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
			join(runDir, FILE.TRANSCRIPT),
		);
		const finishedAt = new Date().toISOString();

		logger.log(
			`Process exited with code ${execResult.exitCode}${execResult.timedOut ? " (timed out)" : ""}`,
		);

		if (execResult.exitCode !== 0) {
			if (execResult.stderr?.trim()) {
				logger.error(`stderr: ${execResult.stderr}`);
			}
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
				config: resolvedConfig,
				vars: mergedVars,
				discovery: allDiscoveredItems,
				prompt: renderedPrompt,
				log: logger.getEntries().join("\n"),
				secrets,
			});
			return;
		}

		const textOutput = execResult.rawJson
			? extractTextFromJson(execResult.rawJson)
			: execResult.stdout;
		const parsed = parseClaudeOutput(textOutput);
		logger.log(`Output: ${textOutput.length} chars, status: ${parsed.status}`);

		const result = execResult.rawJson ? JSON.parse(execResult.rawJson) : null;

		// Deterministic URL from template, fallback to parsed output, then item_key
		const renderedUrlTemplate = config.url_template
			? render(config.url_template, globalVars, taskVars, item)
			: null;
		const resolvedUrl =
			renderedUrlTemplate ??
			parsed.url ??
			(itemKey?.startsWith("http") ? itemKey : null);

		const meta = buildRunMeta(
			runId,
			config.id,
			parsed.status,
			startedAt,
			finishedAt,
			execResult.exitCode,
			itemKey,
			resolvedUrl,
		);
		if (config.auto_mark) {
			meta.marked = true;
		}

		writeRun(runDir, {
			meta,
			config: resolvedConfig,
			vars: mergedVars,
			discovery: allDiscoveredItems,
			result,
			prompt: renderedPrompt,
			report: parsed.report,
			log: logger.getEntries().join("\n"),
			secrets,
		});
	} finally {
		runPostHook(config, globalVars, taskVars, item, logger, baseDir);
	}
}
