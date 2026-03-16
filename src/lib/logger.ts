import { appendFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export interface Logger {
  log(message: string): void;
  error(message: string): void;
  getEntries(): string[];
}

export function createLogger(logPath: string): Logger {
  const entries: string[] = [];

  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, "");

  const append = (level: string, message: string) => {
    const line = `[${new Date().toISOString()}] [${level}] ${message}`;
    entries.push(line);
    appendFileSync(logPath, line + "\n");
  };

  return {
    log: (msg) => append("INFO", msg),
    error: (msg) => append("ERROR", msg),
    getEntries: () => [...entries],
  };
}
