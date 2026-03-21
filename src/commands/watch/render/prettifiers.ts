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
		/(https?:\/\/[^\s)>\]]+)/g,
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
	line.replace(/:\s*"([^"]*)"(,?)$/gm, `: ${JSON_STRING}"$1"${RESET}$2`);

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

/** Color diff lines with text colors (GitHub style) */
const DIFF_ADD = "\x1B[38;2;172;238;187m"; // #aceebb text
const DIFF_DEL = "\x1B[38;2;254;206;202m"; // #fececa text
const DIFF_HEADER_COLOR = "\x1B[36m"; // cyan for @@ lines

function diffLineTransform(line: string): string {
	if (line.startsWith("+")) return `${DIFF_ADD}${line}${RESET}`;
	if (line.startsWith("-")) return `${DIFF_DEL}${line}${RESET}`;
	if (line.startsWith("@@")) return `${DIFF_HEADER_COLOR}${line}${RESET}`;
	return line;
}

function jsonLineTransform(line: string): string {
	return [jsonKeys, jsonStrings, jsonNumbers, jsonBooleans, jsonNulls].reduce(
		(l, fn) => fn(l),
		line,
	);
}

/** Per-language transforms for fenced code blocks */
const codeBlockTransforms: Record<string, (line: string) => string> = {
	diff: diffLineTransform,
	json: jsonLineTransform,
};

/** Apply syntax highlighting inside fenced code blocks (```lang) */
export function applyCodeBlockHighlighting(lines: string[]): string[] {
	let activeLang: string | null = null;
	return lines.map((line) => {
		const fenceMatch = line.match(/^```(\w+)/);
		if (fenceMatch) {
			activeLang = fenceMatch[1];
			return line;
		}
		if (activeLang && line.startsWith("```")) {
			activeLang = null;
			return line;
		}
		if (!activeLang) return line;
		const transform = codeBlockTransforms[activeLang];
		return transform ? transform(line) : line;
	});
}

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
	// First pass: code block highlighting (stateful, must run before per-line transforms)
	const codeHighlighted = applyCodeBlockHighlighting(content.split("\n"));
	// Second pass: per-line transforms
	return applyTransforms(codeHighlighted, [
		headings,
		boldText,
		italicText,
		inlineCode,
		horizontalRule(width),
		urls,
	]);
}

export function metaPrettifier(
	_content: string,
	run: RunRecord,
	_width: number,
): string[] {
	const m = run.meta;
	const lines = [
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
		m.url ? `  URL: ${m.url}` : `  URL: ${DIM}—${RESET}`,
		`  Item key: ${m.item_key ?? `${DIM}—${RESET}`}`,
		`  Exit code: ${m.exit_code === 0 ? `${GREEN}${m.exit_code}${RESET}` : `${RED}${m.exit_code}${RESET}`}`,
		`  Schema: v${m.schema_version}`,
	];
	// Apply shared transforms (URLs become clickable hyperlinks)
	return applyTransforms(lines, [urls]);
}

export function jsonPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return applyTransforms(content.split("\n"), [
		jsonKeys,
		jsonStrings,
		jsonNumbers,
		jsonBooleans,
		jsonNulls,
		urls,
	]);
}

/** Strip ISO timestamps from log lines */
export const stripTimestamps: Transform = (line) =>
	line.replace(/^\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z\]\s*/, "");

export function logPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return applyTransforms(content.split("\n"), [stripTimestamps, urls]);
}

export function defaultPrettifier(
	content: string,
	_run: RunRecord,
	_width: number,
): string[] {
	return content.split("\n");
}

// ── Backward compat export ──

export function renderMarkdownLine(line: string, width = 40): string {
	const transforms = [
		headings,
		boldText,
		italicText,
		inlineCode,
		horizontalRule(width),
		urls,
	];
	return transforms.reduce((l, fn) => fn(l), line);
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
