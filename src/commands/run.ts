import { execSync } from "node:child_process";
import { mkdirSync, renameSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { ulid } from "ulid";
import { purgeBin } from "../lib/bin.js";
import { loadGlobalVars, loadTaskConfig } from "../lib/config.js";
import { filterNewItems } from "../lib/dedup.js";
import { discoverItems } from "../lib/discovery.js";
import { acquireLock, releaseLock } from "../lib/lock.js";
import { createLogger } from "../lib/logger.js";
import { listRuns, writeRun } from "../lib/report.js";
import {
	executePrompt,
	extractTextFromJson,
	parseClaudeOutput,
} from "../lib/runner.js";
import { render } from "../lib/template.js";

function parseRetain(retain?: string): number {
	if (!retain) return 0;
	const match = retain.match(/^(\d+)(d|h|m)$/);
	if (!match) return 0;
	const value = Number(match[1]);
	switch (match[2]) {
		case "d":
			return value * 86400 * 1000;
		case "h":
			return value * 3600 * 1000;
		case "m":
			return value * 60 * 1000;
		default:
			return 0;
	}
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
		try {
			const discoveryCmd = render(
				config.discovery.command,
				globalVars,
				config.vars ?? {},
			);
			items = discoverItems(discoveryCmd, undefined, baseDir);
		} catch (err) {
			const runId = ulid();
			const runDir = join(runsDir, taskId, runDirName(runId));
			const logger = createLogger(join(runDir, "log.txt"));
			logger.error(`Discovery failed: ${err}`);
			writeRun(runDir, {
				meta: {
					schema_version: 1,
					id: runId,
					task: taskId,
					status: "error",

					url: null,
					item_key: null,
					started_at: startedAt,
					finished_at: new Date().toISOString(),
					duration_seconds: 0,
					exit_code: 1,
				},
				log: logger.getEntries().join("\n"),
			});
			console.error(`Discovery failed for ${taskId}: ${err}`);
			return;
		}

		const newItems = filterNewItems(
			runsDir,
			taskId,
			items,
			config.discovery.item_key,
			{ allowRerun: config.allow_rerun },
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
				meta: {
					schema_version: 1,
					id: runId,
					task: taskId,
					status: "skipped",

					url: null,
					item_key: null,
					started_at: startedAt,
					finished_at: finishedAt,
					duration_seconds: Math.round(
						(Date.parse(finishedAt) - Date.parse(startedAt)) / 1000,
					),
					exit_code: 0,
				},
				log: logger.getEntries().join("\n"),
			});
			return;
		}

		if (config.prompt_mode === "per_item") {
			if (config.parallel) {
				await Promise.all(
					newItems.map((item) =>
						executeForItem(config, globalVars, item, runsDir),
					),
				);
			} else {
				for (const item of newItems) {
					await executeForItem(config, globalVars, item, runsDir);
				}
			}
		} else {
			await executeForBatch(config, globalVars, newItems, runsDir);
		}
	} finally {
		// Cleanup: always runs, even when skipped — move completed/error runs to .bin
		if (config.cleanup) {
			const allRuns = listRuns(runsDir, { task: taskId });
			const cleanupPattern = new RegExp(config.cleanup.when);
			const retainMs = parseRetain(config.cleanup.retain);
			const now = Date.now();
			for (const run of allRuns) {
				if (
					run.meta.status !== "completed" &&
					run.meta.status !== "error" &&
					run.meta.status !== "canceled"
				)
					continue;
				if (!run.meta.item_key) continue;
				// Respect retention period
				if (retainMs > 0 && now - Date.parse(run.meta.finished_at) < retainMs)
					continue;
				try {
					const itemVars: Record<string, string> = {};
					if (run.meta.url) itemVars.url = run.meta.url;
					if (run.meta.item_key) itemVars.item_key = run.meta.item_key;
					const cmd = render(config.cleanup.command, globalVars, {}, itemVars);
					const output = execSync(cmd, {
						encoding: "utf-8",
						timeout: 15_000,
						shell: "/bin/bash",
					}).trim();
					if (cleanupPattern.test(output)) {
						const parts = run.dir.split("/");
						const runId = parts[parts.length - 1];
						const dest = join(baseDir, ".bin", taskId, runId);
						mkdirSync(join(baseDir, ".bin", taskId), { recursive: true });
						renameSync(run.dir, dest);
					}
				} catch {
					// Cleanup check failed — skip silently
				}
			}
		}
		releaseLock(taskId, baseDir);
	}
}

async function executeForItem(
	config: ReturnType<typeof loadTaskConfig>,
	globalVars: Record<string, string>,
	item: Record<string, string>,
	runsDir: string,
): Promise<void> {
	const startedAt = new Date().toISOString();
	const runId = ulid();
	const runDir = join(runsDir, config.id, runDirName(runId));
	const taskVars = config.vars ?? {};
	const renderedPrompt = render(config.prompt, globalVars, taskVars, item);
	const renderedCwd = config.cwd
		? render(config.cwd, globalVars, taskVars, item)
		: undefined;

	const logger = createLogger(join(runDir, "log.txt"));
	writeFileSync(join(runDir, "prompt.rendered.md"), renderedPrompt);
	// Write initial meta so orphan runs are trackable
	writeRun(runDir, {
		meta: {
			schema_version: 1,
			id: runId,
			task: config.id,
			status: "processing",
			url: item[config.discovery.item_key] ?? null,
			item_key: item[config.discovery.item_key] ?? null,
			started_at: startedAt,
			finished_at: startedAt,
			duration_seconds: 0,
			exit_code: -1,
		},
		log: "",
	});
	logger.log(`Starting task: ${config.id}`);
	logger.log(`Item: ${item[config.discovery.item_key]}`);
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
			meta: {
				schema_version: 1,
				id: runId,
				task: config.id,
				status: "error",

				url: item[config.discovery.item_key] ?? null,
				item_key: item[config.discovery.item_key] ?? null,
				started_at: startedAt,
				finished_at: finishedAt,
				duration_seconds: Math.round(
					(Date.parse(finishedAt) - Date.parse(startedAt)) / 1000,
				),
				exit_code: execResult.exitCode,
			},
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
		meta: {
			schema_version: 1,
			id: runId,
			task: config.id,
			status: parsed.status,

			url: parsed.url ?? item[config.discovery.item_key] ?? null,
			item_key: item[config.discovery.item_key] ?? null,
			started_at: startedAt,
			finished_at: finishedAt,
			duration_seconds: Math.round(
				(Date.parse(finishedAt) - Date.parse(startedAt)) / 1000,
			),
			exit_code: execResult.exitCode,
		},
		prompt: renderedPrompt,
		rawJson: execResult.rawJson ?? undefined,
		report: parsed.report,
		log: logger.getEntries().join("\n"),
	});
}

async function executeForBatch(
	config: ReturnType<typeof loadTaskConfig>,
	globalVars: Record<string, string>,
	items: Record<string, string>[],
	runsDir: string,
): Promise<void> {
	const startedAt = new Date().toISOString();
	const runId = ulid();
	const runDir = join(runsDir, config.id, runDirName(runId));
	const taskVars = config.vars ?? {};

	const itemsJson = JSON.stringify(items);
	const itemsList = items
		.map((i) => `- ${i[config.discovery.item_key]}`)
		.join("\n");
	const batchVars = { items_json: itemsJson, items_list: itemsList };

	const renderedPrompt = render(config.prompt, globalVars, taskVars, batchVars);
	const renderedCwd = config.cwd
		? render(config.cwd, globalVars, taskVars)
		: undefined;

	const logger = createLogger(join(runDir, "log.txt"));
	writeFileSync(join(runDir, "prompt.rendered.md"), renderedPrompt);
	writeRun(runDir, {
		meta: {
			schema_version: 1,
			id: runId,
			task: config.id,
			status: "processing",
			url: null,
			item_key: null,
			started_at: startedAt,
			finished_at: startedAt,
			duration_seconds: 0,
			exit_code: -1,
		},
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
			meta: {
				schema_version: 1,
				id: runId,
				task: config.id,
				status: "error",

				url: null,
				item_key: null,
				started_at: startedAt,
				finished_at: finishedAt,
				duration_seconds: Math.round(
					(Date.parse(finishedAt) - Date.parse(startedAt)) / 1000,
				),
				exit_code: execResult.exitCode,
			},
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
		meta: {
			schema_version: 1,
			id: runId,
			task: config.id,
			status: parsed.status,

			url: parsed.url,
			item_key: null,
			started_at: startedAt,
			finished_at: finishedAt,
			duration_seconds: Math.round(
				(Date.parse(finishedAt) - Date.parse(startedAt)) / 1000,
			),
			exit_code: execResult.exitCode,
		},
		prompt: renderedPrompt,
		rawJson: execResult.rawJson ?? undefined,
		report: parsed.report,
		log: logger.getEntries().join("\n"),
	});
}
