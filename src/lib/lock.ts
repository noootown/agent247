import { existsSync, readFileSync, writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function acquireLock(taskId: string, baseDir: string): boolean {
  const lockPath = join(baseDir, "tasks", taskId, ".lock");
  if (existsSync(lockPath)) {
    const pid = parseInt(readFileSync(lockPath, "utf-8").trim(), 10);
    if (!isNaN(pid) && isProcessAlive(pid)) {
      return false;
    }
    unlinkSync(lockPath);
  }
  writeFileSync(lockPath, String(process.pid));
  return true;
}

export function releaseLock(taskId: string, baseDir: string): void {
  const lockPath = join(baseDir, "tasks", taskId, ".lock");
  if (existsSync(lockPath)) {
    unlinkSync(lockPath);
  }
}
