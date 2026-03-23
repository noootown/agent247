import yaml from "js-yaml";
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
import { applyCodeBlockHighlighting, highlightCode } from "./highlight.js";

// ── Line Transforms (composable building blocks) ──

export type Transform = (line: string) => string;

/** Markdown headings → bold */
export const headings: Transform = (line) =>
	/^#{1,3} /.test(line)
		? `${BOLD}${line.replace(/^#{1,3} /, "")}${RESET}`
		: line;

/** **bold** → ANSI bold */
export const boldText: Transform = (line) =>
	line.replace(/\*\*(.+?)\*\*/g, `${BOLD}$1${RESET}`);

/** _italic_ → colored (#bd81b8) */
const ITALIC_COLOR = "\x1B[38;2;189;129;184m";
export const italicText: Transform = (line) =>
	line.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, `${ITALIC_COLOR}$1${RESET}`);

/** `code` → colored */
const CODE_COLOR = "\x1B[38;2;175;185;254m";
export const inlineCode: Transform = (line) =>
	line.replace(/`(.+?)`/g, `${CODE_COLOR}$1${RESET}`);

/** --- → dim horizontal rule (width-aware, returns factory) */
export function horizontalRule(width: number): Transform {
	return (line) =>
		/^---+$/.test(line) ? `${DIM}${"─".repeat(width)}${RESET}` : line;
}

/** URLs → blue clickable hyperlinks */
export const urls: Transform = (line) =>
	line.replace(
		/(https?:\/\/[^\s)>\]"*\\]+)/g,
		(url) => `\x1B[94m${hyperlink(url, url)}${RESET}`,
	);

/** ISO timestamps [2026-03-21T...] → dimmed */
export const timestamps: Transform = (line) =>
	line.replace(
		/^(\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\])/,
		`${DIM}$1${RESET}`,
	);

/** JSON keys → colored */
const JSON_KEY = "\x1B[38;2;137;180;250m";
export const jsonKeys: Transform = (line) =>
	line.replace(/"([^"]+)"(?=\s*:)/g, `${JSON_KEY}"$1"${RESET}`);

/** JSON string values → colored */
const JSON_STRING = "\x1B[38;2;206;145;120m";
export const jsonStrings: Transform = (line) =>
	line.replace(/:\s*"([^"]*)"(,?)$/gm, (_match, val, comma) =>
		/^https?:\/\//.test(val)
			? `: ${val}${comma}`
			: `: ${JSON_STRING}"${val}"${RESET}${comma}`,
	);

/** JSON number values → colored */
const JSON_NUMBER = "\x1B[38;2;181;206;168m";
export const jsonNumbers: Transform = (line) =>
	line.replace(/:\s*(\d+\.?\d*)(,?)$/gm, `: ${JSON_NUMBER}$1${RESET}$2`);

/** JSON boolean values → colored */
const JSON_BOOL = "\x1B[38;2;206;145;120m";
export const jsonBooleans: Transform = (line) =>
	line.replace(/:\s*(true|false)(,?)$/gm, `: ${JSON_BOOL}$1${RESET}$2`);

/** JSON null values → dimmed */
export const jsonNulls: Transform = (line) =>
	line.replace(/:\s*(null)(,?)$/gm, `: ${DIM}$1${RESET}$2`);

// ── Transform Composition ──

/** Apply transforms left-to-right to each line */
export function applyTransforms(
	lines: string[],
	transforms: Transform[],
): string[] {
	return lines.map((line) => transforms.reduce((l, fn) => fn(l), line));
}

/** Strip ISO timestamps from log lines */
export const stripTimestamps: Transform = (line) =>
	line.replace(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\]\s*/, "");

/** Color log levels [INFO] [ERROR] [WARN] etc. */
const LOG_INFO = "\x1B[38;2;97;175;239m"; // blue
const LOG_ERROR = "\x1B[38;2;224;108;117m"; // red
const LOG_WARN = "\x1B[38;2;229;192;123m"; // yellow
export const logLevels: Transform = (line) =>
	line
		.replace(/\[INFO\]/g, `${LOG_INFO}[INFO]${RESET}`)
		.replace(/\[ERROR\]/g, `${LOG_ERROR}[ERROR]${RESET}`)
		.replace(/\[WARN\]/g, `${LOG_WARN}[WARN]${RESET}`);

// ── Prettifiers (composed from transforms) ──

export type Prettifier = (
	content: string,
	run: RunRecord,
	width: number,
) => string[];

export function markdownPrettifier(
	content: string,
	_run: RunRecord,
	width: number,
): string[] {
	const codeHighlighted = applyCodeBlockHighlighting(content.split("\n"));
	return applyTransforms(codeHighlighted, [
		headings,
		boldText,
		italicText,
		inlineCode,
		horizontalRule(width),
		urls,
	]);
}

/** "run" tab — meta info + divider + resolved config from data.json */
export function runPrettifier(
	content: string,
	_run: RunRecord,
	width: number,
): string[] {
	let data: Record<string, unknown> = {};
	try {
		data = JSON.parse(content);
	} catch {
		return ["Invalid data.json"];
	}

	const m = (data.run ?? {}) as Record<string, unknown>;
	const metaLines = [
		`${BOLD}Run${RESET}`,
		`  ID: ${m.id ?? "—"}`,
		`  Task: ${BOLD}${MAGENTA}${m.task ?? "—"}${RESET}`,
		`  Status: ${statusIcon(String(m.status ?? ""))} ${statusText(String(m.status ?? ""))}`,
		"",
		`${BOLD}Timing${RESET}`,
		m.started_at
			? `  Started: ${formatTime(String(m.started_at))} ${DIM}(${formatAgo(Date.parse(String(m.started_at)))})${RESET}`
			: null,
		m.finished_at
			? `  Finished: ${formatTime(String(m.finished_at))} ${DIM}(${formatAgo(Date.parse(String(m.finished_at)))})${RESET}`
			: null,
		m.duration_seconds != null ? `  Duration: ${m.duration_seconds}s` : null,
		"",
		`${BOLD}Details${RESET}`,
		m.url ? `  URL: ${m.url}` : `  URL: ${DIM}—${RESET}`,
		`  Item key: ${m.item_key ?? `${DIM}—${RESET}`}`,
		m.exit_code != null
			? `  Exit code: ${m.exit_code === 0 ? `${GREEN}${m.exit_code}${RESET}` : `${RED}${m.exit_code}${RESET}`}`
			: null,
	].filter((l): l is string => l !== null);

	const divider = `${DIM}${"─".repeat(width)}${RESET}`;
	const configLines: string[] = [];
	if (data.config) {
		const configYaml = yaml.dump(data.config, { lineWidth: -1 });
		const highlighted = highlightCode(configYaml, "yaml");
		configLines.push(...highlighted.split("\n"));
	}

	return [
		...applyTransforms(metaLines, [urls]),
		"",
		divider,
		"",
		`${BOLD}Config${RESET}`,
		"",
		...applyTransforms(configLines, [urls]),
	];
}

/** "data" tab — vars + discovery + result from data.json */
export function dataPrettifier(
	content: string,
	_run: RunRecord,
	width: number,
): string[] {
	let data: Record<string, unknown> = {};
	try {
		data = JSON.parse(content);
	} catch {
		return ["Invalid data.json"];
	}

	const divider = `${DIM}${"─".repeat(width)}${RESET}`;
	const lines: string[] = [];

	if (data.vars) {
		lines.push(`${BOLD}Vars${RESET}`, "");
		const varsJson = JSON.stringify(data.vars, null, 2);
		const highlighted = highlightCode(varsJson, "json");
		lines.push(...applyTransforms(highlighted.split("\n"), [urls]));
		lines.push("", divider, "");
	}

	if (data.discovery) {
		lines.push(`${BOLD}Discovery${RESET}`, "");
		const discoveryJson = JSON.stringify(data.discovery, null, 2);
		const highlighted = highlightCode(discoveryJson, "json");
		lines.push(...applyTransforms(highlighted.split("\n"), [urls]));
		lines.push("", divider, "");
	}

	if (data.result !== undefined) {
		lines.push(`${BOLD}Result${RESET}`, "");
		const resultJson = JSON.stringify(data.result, null, 2);
		const highlighted = highlightCode(resultJson, "json");
		lines.push(...applyTransforms(highlighted.split("\n"), [urls]));
	}

	return lines;
}

export function jsonPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	const highlighted = highlightCode(content, "json");
	return applyTransforms(highlighted.split("\n"), [urls]);
}

export function logPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return applyTransforms(content.split("\n"), [
		stripTimestamps,
		logLevels,
		urls,
	]);
}

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
	run: runPrettifier,
	data: dataPrettifier,
};

export function getPrettifier(fileName: string): Prettifier {
	return prettifiers[fileName] ?? defaultPrettifier;
}

// Re-export from highlight.ts for tests
export {
	applyCodeBlockHighlighting,
	highlightCode,
	hljsToAnsi,
} from "./highlight.js";
