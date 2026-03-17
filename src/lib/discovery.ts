import { execSync } from "node:child_process";

export function discoverItems(
	command: string,
	env?: Record<string, string>,
	cwd?: string,
): Record<string, string>[] {
	const output = execSync(command, {
		encoding: "utf-8",
		timeout: 30_000,
		shell: "/bin/bash",
		env: { ...process.env, ...env },
		cwd,
	});
	const parsed = JSON.parse(output.trim());
	if (!Array.isArray(parsed)) {
		throw new Error(
			`Discovery command must return a JSON array, got: ${typeof parsed}`,
		);
	}
	return parsed;
}
