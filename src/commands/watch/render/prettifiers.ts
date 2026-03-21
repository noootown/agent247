import hljs from "highlight.js";
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

/** JSON string values → colored (URLs rendered without quotes) */
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

// ── highlight.js → ANSI thin wrapper ──

/** Map hljs CSS classes to ANSI colors */
const HLJS_THEME: Record<string, string> = {
	"hljs-keyword": "\x1B[38;2;198;120;221m", // purple
	"hljs-string": "\x1B[38;2;152;195;121m", // green
	"hljs-number": "\x1B[38;2;209;154;102m", // orange
	"hljs-literal": "\x1B[38;2;209;154;102m", // orange (true/false/null)
	"hljs-built_in": "\x1B[38;2;97;175;239m", // blue
	"hljs-comment": "\x1B[38;2;128;128;128m", // gray
	"hljs-attr": "\x1B[38;2;97;175;239m", // blue (JSON keys, HTML attrs)
	"hljs-title": "\x1B[38;2;97;175;239m", // blue (function/class names)
	"hljs-variable": "\x1B[38;2;224;108;117m", // red
	"hljs-params": "\x1B[38;2;171;178;191m", // light gray
	"hljs-punctuation": `${DIM}`, // dim
	"hljs-subst": "\x1B[38;2;224;108;117m", // red (interpolation)
	"hljs-type": "\x1B[38;2;229;192;123m", // yellow
	"hljs-meta": `${DIM}`, // dim
	"hljs-regexp": "\x1B[38;2;152;195;121m", // green
	"hljs-symbol": "\x1B[38;2;209;154;102m", // orange
};

/** Convert highlight.js HTML output to ANSI-colored string */
export function hljsToAnsi(html: string): string {
	// Replace <span class="hljs-xxx">...</span> with ANSI (before entity decoding)
	let result = html.replace(
		/<span class="(hljs-[\w-]+)">([\s\S]*?)<\/span>/g,
		(_match, cls: string, content: string) => {
			const color = HLJS_THEME[cls];
			const inner = hljsToAnsi(content);
			return color ? `${color}${inner}${RESET}` : inner;
		},
	);
	// Strip any remaining HTML tags
	result = result.replace(/<[^>]+>/g, "");
	// Decode HTML entities last (after tags are gone, so < > don't get stripped)
	result = result
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"');
	return result;
}

/** Minimal bash fallback: color first word as command for lines highlight.js missed */
const BASH_CMD_COLOR = "\x1B[38;2;152;195;121m"; // green
function bashFallbackLine(line: string): string {
	// If line already has ANSI codes, highlight.js handled it
	if (line.includes("\x1B[")) return line;
	// Color first word as command
	return line.replace(/^(\s*)([\w./-]+)/, `$1${BASH_CMD_COLOR}$2${RESET}`);
}

/** Highlight code with highlight.js and convert to ANSI */
export function highlightCode(code: string, language: string): string {
	try {
		const result = hljs.highlight(code, { language });
		let ansi = hljsToAnsi(result.value);
		// For bash: apply fallback coloring to lines highlight.js left plain
		if (language === "bash" || language === "sh" || language === "shell") {
			ansi = ansi.split("\n").map(bashFallbackLine).join("\n");
		}
		return ansi;
	} catch {
		return code;
	}
}

/** Apply syntax highlighting inside fenced code blocks (```lang) */
export function applyCodeBlockHighlighting(lines: string[]): string[] {
	const result: string[] = [];
	let activeLang: string | null = null;
	let blockLines: string[] = [];

	for (const line of lines) {
		const fenceMatch = line.match(/^```(\w+)/);
		if (fenceMatch && !activeLang) {
			activeLang = fenceMatch[1];
			blockLines = [];
			result.push(`${DIM}${line}${RESET}`);
			continue;
		}
		if (activeLang && line.startsWith("```")) {
			if (activeLang === "diff") {
				for (const bl of blockLines) {
					result.push(diffLineTransform(bl));
				}
			} else {
				const highlighted = highlightCode(blockLines.join("\n"), activeLang);
				result.push(...highlighted.split("\n"));
			}
			activeLang = null;
			blockLines = [];
			result.push(`${DIM}${line}${RESET}`);
			continue;
		}
		if (activeLang) {
			blockLines.push(line);
		} else {
			result.push(line);
		}
	}
	if (activeLang && blockLines.length > 0) {
		result.push(...blockLines);
	}
	return result;
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
	const highlighted = highlightCode(content, "json");
	return applyTransforms(highlighted.split("\n"), [urls]);
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
