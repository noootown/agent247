import { spawnSync } from "node:child_process";

export interface ExecuteResult {
	exitCode: number;
	stdout: string;
	stderr: string;
	rawJson: string | null;
	transcript: string;
	timedOut: boolean;
}

export interface ParsedOutput {
	status: "completed";
	url: string | null;
	report: string;
}

const URL_REGEX = /^https?:\/\/\S+$/;

export function parseClaudeOutput(output: string): ParsedOutput {
	const trimmed = output.trim();
	const lines = trimmed.split("\n");
	const firstLine = lines[0]?.trim() ?? "";
	const url = URL_REGEX.test(firstLine) ? firstLine : null;
	return { status: "completed", url, report: trimmed };
}

function buildTranscript(streamOutput: string): {
	transcript: string;
	resultJson: string | null;
	resultText: string;
} {
	const lines = streamOutput.trim().split("\n");
	const parts: string[] = [];
	let resultJson: string | null = null;
	let resultText = "";

	for (const line of lines) {
		if (!line.trim()) continue;
		let event: Record<string, unknown>;
		try {
			event = JSON.parse(line);
		} catch {
			continue;
		}

		const type = event.type as string;

		if (type === "assistant") {
			const msg = event.message as Record<string, unknown>;
			const content = msg?.content as Array<Record<string, unknown>>;
			if (!content) continue;

			for (const block of content) {
				if (block.type === "text" && block.text) {
					parts.push(String(block.text));
					parts.push("");
				}
				if (block.type === "tool_use") {
					const name = block.name as string;
					const input = block.input as Record<string, unknown>;
					parts.push(`### Tool: ${name}`);
					if (name === "Bash" && input?.command) {
						parts.push("```bash");
						parts.push(String(input.command));
						parts.push("```");
					} else if (name === "Edit" && input?.file_path) {
						parts.push(`File: \`${input.file_path}\``);
					} else if (name === "Read" && input?.file_path) {
						parts.push(`File: \`${input.file_path}\``);
					} else if (name === "Write" && input?.file_path) {
						parts.push(`File: \`${input.file_path}\``);
					} else if (name === "Grep" && input?.pattern) {
						parts.push(`Pattern: \`${input.pattern}\``);
					} else {
						parts.push("```json");
						parts.push(JSON.stringify(input, null, 2).slice(0, 500));
						parts.push("```");
					}
					parts.push("");
				}
			}
		}

		if (type === "result") {
			resultJson = line;
			resultText = (event.result as string) ?? "";
		}
	}

	return {
		transcript: parts.join("\n"),
		resultJson,
		resultText,
	};
}

export function executePrompt(
	renderedPrompt: string,
	timeoutSeconds: number,
	command: string = "claude",
	model: string = "sonnet",
	cwd?: string,
): ExecuteResult {
	const isClaude = command === "claude";
	const args = isClaude
		? [
				"-p",
				renderedPrompt,
				"--output-format",
				"stream-json",
				"--verbose",
				"--model",
				model,
			]
		: [renderedPrompt];

	const result = spawnSync(command, args, {
		encoding: "utf-8",
		timeout: timeoutSeconds * 1000,
		env: process.env,
		maxBuffer: 50 * 1024 * 1024,
		cwd,
	});

	const stdout = result.stdout ?? "";

	if (!isClaude) {
		return {
			exitCode: result.status ?? 1,
			stdout,
			stderr: result.stderr ?? "",
			rawJson: null,
			transcript: "",
			timedOut: result.signal === "SIGTERM",
		};
	}

	const { transcript, resultJson, resultText } = buildTranscript(stdout);

	return {
		exitCode: result.status ?? 1,
		stdout: resultText,
		stderr: result.stderr ?? "",
		rawJson: resultJson,
		transcript,
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
