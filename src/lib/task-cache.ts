import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { FILE } from "./constants.js";

interface TaskCache {
	last_check: string;
}

export function writeTaskCache(
	runsDir: string,
	taskId: string,
	data: TaskCache,
): void {
	const dir = join(runsDir, taskId);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, FILE.CACHE), JSON.stringify(data, null, 2));
}

export function readTaskCache(
	runsDir: string,
	taskId: string,
): TaskCache | null {
	const cachePath = join(runsDir, taskId, FILE.CACHE);
	if (!existsSync(cachePath)) return null;
	try {
		return JSON.parse(readFileSync(cachePath, "utf-8"));
	} catch {
		return null;
	}
}
