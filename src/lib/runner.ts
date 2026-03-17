import { spawnSync } from "node:child_process";

export interface ExecuteResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	rawJson: string | null;
	timedOut: boolean;
}

export interface ParsedOutput {
	status: "completed" | "no-action";
	url: string | null;
	report: string;
}

const URL_REGEX = /^https?:\/\/\S+$/;

export function parseClaudeOutput(output: string): ParsedOutput {
	const trimmed = output.trim();
	if (trimmed === "NO_ACTION" || trimmed.startsWith("NO_ACTION")) {
		return { status: "no-action", url: null, report: trimmed };
	}
	const lines = trimmed.split("\n");
	const firstLine = lines[0]?.trim() ?? "";
	const url = URL_REGEX.test(firstLine) ? firstLine : null;
	return { status: "completed", url, report: trimmed };
}

export function executePrompt(
	renderedPrompt: string,
	timeoutSeconds: number,
	command: string = "claude",
	model: string = "sonnet",
	cwd?: string,
): ExecuteResult {
	const isJson = command === "claude";
	const args =
		command === "claude"
			? ["-p", renderedPrompt, "--output-format", "json", "--model", model]
			: [renderedPrompt];

	const result = spawnSync(command, args, {
		encoding: "utf-8",
		timeout: timeoutSeconds * 1000,
		env: process.env,
		maxBuffer: 10 * 1024 * 1024,
		cwd,
	});

	return {
		exitCode: result.status ?? 1,
		stdout: result.stdout ?? "",
		stderr: result.stderr ?? "",
		rawJson: isJson ? result.stdout : null,
		timedOut: result.signal === "SIGTERM",
	};
}

export function extractTextFromJson(rawJson: string): string {
	try {
		const parsed = JSON.parse(rawJson);
		if (typeof parsed.result === "string") return parsed.result;
		return rawJson;
	} catch {
		return rawJson;
	}
}
