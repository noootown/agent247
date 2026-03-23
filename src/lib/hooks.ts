import { execSync } from "node:child_process";
import type { Logger } from "./logger.js";

export function execHook(
	cmd: string,
	cwd: string | undefined,
	logger: Logger,
): void {
	try {
		const result = execSync(cmd, {
			encoding: "utf-8",
			timeout: 60_000,
			shell: "/bin/bash",
			stdio: "pipe",
			cwd,
		});
		const stdout = result?.trim() ?? "";
		if (stdout) {
			for (const line of stdout.split("\n")) {
				logger.log(line);
			}
		}
	} catch (err: unknown) {
		const execErr = err as { stderr?: string; stdout?: string };
		if (execErr.stdout?.trim()) {
			for (const line of execErr.stdout.trim().split("\n")) {
				logger.log(line);
			}
		}
		if (execErr.stderr?.trim()) {
			for (const line of execErr.stderr.trim().split("\n")) {
				logger.error(line);
			}
		}
		logger.error(`Hook failed: ${err}`);
		throw err;
	}
}
