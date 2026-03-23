import { execSync } from "node:child_process";
import type { Logger } from "./logger.js";

export function execHook(
	cmd: string,
	cwd: string | undefined,
	logger: Logger,
): void {
	try {
		execSync(cmd, {
			encoding: "utf-8",
			timeout: 60_000,
			shell: "/bin/bash",
			stdio: "pipe",
			cwd,
		});
	} catch (err) {
		logger.error(`Hook failed: ${err}`);
		throw err;
	}
}
