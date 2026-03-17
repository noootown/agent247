import { existsSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const BIN_MAX_AGE = 5 * 86400 * 1000; // 5 days

export function purgeBin(baseDir: string): number {
	const binDir = join(baseDir, ".bin");
	if (!existsSync(binDir)) return 0;
	let cleaned = 0;
	const cutoff = Date.now() - BIN_MAX_AGE;
	const taskDirs = readdirSync(binDir, { withFileTypes: true }).filter((d) =>
		d.isDirectory(),
	);
	for (const taskDir of taskDirs) {
		const taskPath = join(binDir, taskDir.name);
		const runDirs = readdirSync(taskPath, { withFileTypes: true }).filter((d) =>
			d.isDirectory(),
		);
		for (const runDir of runDirs) {
			const runPath = join(taskPath, runDir.name);
			const mtime = statSync(runPath).mtimeMs;
			if (mtime < cutoff) {
				rmSync(runPath, { recursive: true, force: true });
				cleaned++;
			}
		}
		if (readdirSync(taskPath).length === 0) {
			rmSync(taskPath, { recursive: true, force: true });
		}
	}
	return cleaned;
}
