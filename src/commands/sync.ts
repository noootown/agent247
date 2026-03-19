import { join, resolve } from "node:path";
import { listTasks } from "../lib/config.js";
import { removeCrontabBlock } from "../lib/crontab.js";
import { syncLaunchd } from "../lib/launchd.js";

export function syncCommand(baseDir: string): void {
	const tasks = listTasks(baseDir);
	const enabledTasks = tasks
		.filter((t) => t.config.enabled)
		.map((t) => ({
			id: t.id,
			name: t.config.name,
			schedule: t.config.schedule,
		}));

	const projectRoot = resolve(import.meta.dirname ?? process.cwd(), "../..");
	const distCli = join(projectRoot, "dist", "cli.js");
	const absBaseDir = resolve(baseDir);

	const envVars: Record<string, string> = {};
	if (process.env.HOME) envVars.HOME = process.env.HOME;
	if (process.env.USER) envVars.USER = process.env.USER;
	const seen = new Set<string>();
	envVars.PATH = (process.env.PATH ?? "")
		.split(":")
		.filter((p) => !p.includes("fnm_multishells"))
		.filter((p) => {
			if (seen.has(p)) return false;
			seen.add(p);
			return true;
		})
		.join(":");

	// Migrate from crontab if needed
	removeCrontabBlock();

	syncLaunchd(enabledTasks, process.execPath, distCli, absBaseDir, envVars);

	if (enabledTasks.length === 0) {
		console.log("No enabled tasks. Removed all launch agents.");
	} else {
		console.log(`Synced ${enabledTasks.length} task(s) to launchd:`);
		for (const task of enabledTasks) {
			console.log(`  ${task.id} — ${task.schedule}`);
		}
	}
}
