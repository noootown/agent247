import {
	appendFileSync,
	existsSync,
	readFileSync,
	unlinkSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";

function isProcessAlive(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

function lockPath(taskId: string, baseDir: string): string {
	return join(baseDir, "tasks", taskId, ".lock");
}

/**
 * .lock file format:
 *   Line 1: runner PID (the agent247 process)
 *   Line 2+: child PIDs (Claude Code sessions spawned by the runner)
 */

export function acquireLock(taskId: string, baseDir: string): boolean {
	const path = lockPath(taskId, baseDir);
	if (existsSync(path)) {
		const firstLine = readFileSync(path, "utf-8").split("\n")[0].trim();
		const pid = parseInt(firstLine, 10);
		if (!Number.isNaN(pid) && isProcessAlive(pid)) {
			return false;
		}
		unlinkSync(path);
	}
	writeFileSync(path, String(process.pid));
	return true;
}

export function releaseLock(taskId: string, baseDir: string): void {
	const path = lockPath(taskId, baseDir);
	if (existsSync(path)) {
		unlinkSync(path);
	}
}

/** Append a child process PID to the lock file. */
export function registerChildPid(
	taskId: string,
	baseDir: string,
	pid: number,
): void {
	const path = lockPath(taskId, baseDir);
	appendFileSync(path, `\n${pid}`);
}

/** Read all PIDs from the lock file (runner + children). */
export function getAllPids(taskId: string, baseDir: string): number[] {
	const path = lockPath(taskId, baseDir);
	if (!existsSync(path)) return [];
	return readFileSync(path, "utf-8")
		.trim()
		.split("\n")
		.map((s) => parseInt(s.trim(), 10))
		.filter((n) => !Number.isNaN(n));
}
