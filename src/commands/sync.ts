import { execSync } from "node:child_process";
import {
	appendFileSync,
	existsSync,
	readFileSync,
	writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { listTasks } from "../lib/config.js";
import { syncLaunchd } from "../lib/launchd.js";

function mergeGitignore(workspacePath: string): void {
	const templatePath = join(
		import.meta.dirname ?? process.cwd(),
		"../templates/.gitignore.workspace",
	);
	const template = readFileSync(templatePath, "utf-8");
	const templateLines = template.split("\n").map((l) => l.trim());

	if (!existsSync(workspacePath)) {
		writeFileSync(workspacePath, template);
		return;
	}

	const existing = readFileSync(workspacePath, "utf-8");
	const existingSet = new Set(existing.split("\n").map((l) => l.trim()));

	const missing = templateLines.filter(
		(l) => l && !l.startsWith("#") && !existingSet.has(l),
	);
	if (missing.length === 0) return;

	const block = `\n# agent247 managed\n${missing.join("\n")}\n`;
	appendFileSync(workspacePath, block);
}

export function syncCommand(baseDir: string, quiet = false): void {
	const projectRoot = resolve(import.meta.dirname ?? process.cwd(), "../..");

	// Rebuild dist/ so launchd always runs the latest code
	if (!quiet) console.log("Building dist/...");
	execSync("pnpm build", {
		cwd: projectRoot,
		stdio: quiet ? "pipe" : "inherit",
	});

	const tasks = listTasks(baseDir);
	const enabledTasks = tasks
		.filter((t) => t.config.cron_enabled)
		.map((t) => ({
			id: t.id,
			name: t.config.name,
			schedule: t.config.schedule,
		}));

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

	mergeGitignore(join(absBaseDir, ".gitignore"));
	syncLaunchd(enabledTasks, process.execPath, distCli, absBaseDir, envVars);

	if (enabledTasks.length === 0) {
		console.log("No cron-enabled tasks. Removed all launch agents.");
	} else {
		console.log(`Synced ${enabledTasks.length} task(s) to launchd:`);
		for (const task of enabledTasks) {
			console.log(`  ${task.id} — ${task.schedule}`);
		}
	}
}
