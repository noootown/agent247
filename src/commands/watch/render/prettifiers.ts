import type { RunRecord } from "../../../lib/report.js";
import {
	BOLD,
	DIM,
	formatAgo,
	formatTime,
	GREEN,
	hyperlink,
	MAGENTA,
	RED,
	RESET,
	statusIcon,
	statusText,
} from "./ansi.js";

export type Prettifier = (
	content: string,
	run: RunRecord,
	width: number,
) => string[];

// ── Markdown ──

export function renderMarkdownLine(line: string, width = 40): string {
	if (/^#{1,3} /.test(line)) {
		return `${BOLD}${line.replace(/^#{1,3} /, "")}${RESET}`;
	}
	line = line.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);
	line = line.replace(/`(.+?)`/g, "\x1B[38;2;175;185;254m$1\x1B[0m");
	if (/^---+$/.test(line)) {
		return `${DIM}${"─".repeat(width)}${RESET}`;
	}
	return line;
}

export function markdownPrettifier(
	content: string,
	_run: RunRecord,
	width: number,
): string[] {
	return content.split("\n").map((l) => renderMarkdownLine(l, width));
}

// ── Meta (prettified from run.meta, ignores raw content) ──

export function metaPrettifier(
	_content: string,
	run: RunRecord,
	_width: number,
): string[] {
	const m = run.meta;
	return [
		`${BOLD}Run${RESET}`,
		`  ID: ${m.id}`,
		`  Task: ${BOLD}${MAGENTA}${m.task}${RESET}`,
		`  Status: ${statusIcon(m.status)} ${statusText(m.status)}`,
		"",
		`${BOLD}Timing${RESET}`,
		`  Started: ${formatTime(m.started_at)} ${DIM}(${formatAgo(Date.parse(m.started_at))})${RESET}`,
		`  Finished: ${formatTime(m.finished_at)} ${DIM}(${formatAgo(Date.parse(m.finished_at))})${RESET}`,
		`  Duration: ${m.duration_seconds}s`,
		"",
		`${BOLD}Details${RESET}`,
		m.url?.startsWith("http")
			? `  URL: \x1B[94m${hyperlink(m.url, m.url)}${RESET}`
			: `  URL: ${DIM}—${RESET}`,
		`  Item key: ${m.item_key ?? `${DIM}—${RESET}`}`,
		`  Exit code: ${m.exit_code === 0 ? `${GREEN}${m.exit_code}${RESET}` : `${RED}${m.exit_code}${RESET}`}`,
		`  Schema: v${m.schema_version}`,
	];
}

// ── JSON (syntax highlighted) ──

const JSON_KEY = "\x1B[38;2;137;180;250m"; // light blue
const JSON_STRING = "\x1B[38;2;206;145;120m"; // warm orange
const JSON_NUMBER = "\x1B[38;2;181;206;168m"; // soft green
const JSON_BOOL = "\x1B[38;2;206;145;120m"; // warm orange
const JSON_NULL = `${DIM}`;

export function jsonPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return content.split("\n").map((line) =>
		line
			.replace(/"([^"]+)"(?=\s*:)/g, `${JSON_KEY}"$1"${RESET}`)
			.replace(/:\s*"([^"]*)"(,?)$/gm, `: ${JSON_STRING}"$1"${RESET}$2`)
			.replace(/:\s*(\d+\.?\d*)(,?)$/gm, `: ${JSON_NUMBER}$1${RESET}$2`)
			.replace(/:\s*(true|false)(,?)$/gm, `: ${JSON_BOOL}$1${RESET}$2`)
			.replace(/:\s*(null)(,?)$/gm, `: ${JSON_NULL}$1${RESET}$2`),
	);
}

// ── Log (dimmed timestamps) ──

const LOG_TIMESTAMP = `${DIM}`;

export function logPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return content
		.split("\n")
		.map((line) =>
			line.replace(
				/^(\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\])/,
				`${LOG_TIMESTAMP}$1${RESET}`,
			),
		);
}

// ── Default (raw lines) ──

export function defaultPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return content.split("\n");
}

// ── Prettifier registry ──

export const prettifiers: Record<string, Prettifier> = {
	"report.md": markdownPrettifier,
	"transcript.md": markdownPrettifier,
	"prompt.rendered.md": markdownPrettifier,
	"log.txt": logPrettifier,
	"meta.yaml": metaPrettifier,
	"vars.json": jsonPrettifier,
	"response.json": jsonPrettifier,
};

export function getPrettifier(fileName: string): Prettifier {
	return prettifiers[fileName] ?? defaultPrettifier;
}
