import { type ChildProcess, spawn } from "node:child_process";
import { appendFileSync, writeFileSync } from "node:fs";

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

function formatEventToMarkdown(event: Record<string, unknown>): string | null {
	const type = event.type as string;

	if (type === "assistant") {
		const msg = event.message as Record<string, unknown>;
		const content = msg?.content as Array<Record<string, unknown>>;
		if (!content) return null;

		const parts: string[] = [];
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
		return parts.length > 0 ? parts.join("\n") : null;
	}

	return null;
}

export function executePrompt(
	renderedPrompt: string,
	timeoutSeconds: number,
	command: string = "claude",
	model: string = "sonnet",
	cwd?: string,
	transcriptPath?: string,
): Promise<ExecuteResult> {
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

	return new Promise((resolve) => {
		const child: ChildProcess = spawn(command, args, {
			env: process.env,
			cwd,
			stdio: ["pipe", "pipe", "pipe"],
			detached: true,
		});

		let stdout = "";
		let stderr = "";
		let resultJson: string | null = null;
		let resultText = "";
		let transcriptContent = "";
		let timedOut = false;

		const timeout = setTimeout(() => {
			timedOut = true;
			// Kill the entire process group
			if (child.pid) {
				try {
					process.kill(-child.pid, "SIGTERM");
				} catch {
					child.kill("SIGTERM");
				}
			}
			// Force kill after 5 seconds if still alive
			setTimeout(() => {
				if (child.pid) {
					try {
						process.kill(-child.pid, "SIGKILL");
					} catch {}
				}
			}, 5000);
		}, timeoutSeconds * 1000);

		if (transcriptPath) {
			writeFileSync(transcriptPath, "");
		}

		child.stdout?.on("data", (chunk: Buffer) => {
			const text = chunk.toString();
			stdout += text;

			if (!isClaude) return;

			// Process each line for real-time transcript
			for (const line of text.split("\n")) {
				if (!line.trim()) continue;
				let event: Record<string, unknown>;
				try {
					event = JSON.parse(line);
				} catch {
					continue;
				}

				if ((event.type as string) === "result") {
					resultJson = line;
					resultText = (event.result as string) ?? "";
				}

				const md = formatEventToMarkdown(event);
				if (md) {
					transcriptContent += `${md}\n`;
					if (transcriptPath) {
						appendFileSync(transcriptPath, `${md}\n`);
					}
				}
			}
		});

		child.stderr?.on("data", (chunk: Buffer) => {
			stderr += chunk.toString();
		});

		child.on("close", (code) => {
			clearTimeout(timeout);

			if (!isClaude) {
				resolve({
					exitCode: code ?? 1,
					stdout,
					stderr,
					rawJson: null,
					transcript: "",
					timedOut,
				});
				return;
			}

			resolve({
				exitCode: code ?? 1,
				stdout: resultText,
				stderr,
				rawJson: resultJson,
				transcript: transcriptContent,
				timedOut,
			});
		});

		child.on("error", () => {
			clearTimeout(timeout);
			resolve({
				exitCode: 1,
				stdout: "",
				stderr: "Failed to spawn process",
				rawJson: null,
				transcript: transcriptContent,
				timedOut: false,
			});
		});
	});
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
