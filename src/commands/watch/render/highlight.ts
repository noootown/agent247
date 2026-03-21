/**
 * Code block syntax highlighting for the TUI.
 * Uses highlight.js for most languages, custom highlighter for bash.
 */

import hljs from "highlight.js";
import { DIM, RESET } from "./ansi.js";

// ── highlight.js → ANSI theme ──

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
	let result = html.replace(
		/<span class="(hljs-[\w-]+)">([\s\S]*?)<\/span>/g,
		(_match, cls: string, content: string) => {
			const color = HLJS_THEME[cls];
			const inner = hljsToAnsi(content);
			return color ? `${color}${inner}${RESET}` : inner;
		},
	);
	result = result.replace(/<[^>]+>/g, "");
	result = result
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"');
	return result;
}

// ── Custom bash highlighter ──

const BASH_COMMAND = "\x1B[38;2;152;195;121m"; // green
const BASH_STRING = HLJS_THEME["hljs-string"]; // green (same as hljs strings)
const BASH_PATH = "\x1B[38;2;209;154;102m"; // orange
const BASH_FLAG = "\x1B[38;2;171;178;191m"; // light gray
const BASH_REDIRECT = "\x1B[38;2;198;120;221m"; // purple
const BASH_PIPE = "\x1B[38;2;198;120;221m"; // purple
const BASH_VAR = "\x1B[38;2;224;108;117m"; // red
const BASH_COMMENT = "\x1B[38;2;128;128;128m"; // gray

function bashHighlight(code: string): string {
	return code
		.split("\n")
		.map((line) => {
			if (line.trimStart().startsWith("#")) {
				return `${BASH_COMMENT}${line}${RESET}`;
			}
			// Use placeholders to protect colored tokens from later regexes
			const tokens: string[] = [];
			function token(colored: string): string {
				tokens.push(colored);
				return `\u00ABT${tokens.length - 1}\u00BB`;
			}
			let work = line;
			// Strings
			work = work.replace(/"([^"]*)"/g, (_m, c) =>
				token(`${BASH_STRING}"${c}"${RESET}`),
			);
			work = work.replace(/'([^']*)'/g, (_m, c) =>
				token(`${BASH_STRING}'${c}'${RESET}`),
			);
			// Variables
			work = work.replace(/(\$\{?\w+\}?)/g, (m) =>
				token(`${BASH_VAR}${m}${RESET}`),
			);
			// Redirects
			work = work.replace(/(\d*>&?\d+|[<>]{1,2})/g, (m) =>
				token(`${BASH_REDIRECT}${m}${RESET}`),
			);
			// Pipes and logical operators
			work = work.replace(/(\|{1,2}|&&|;)/g, (m) =>
				token(`${BASH_PIPE}${m}${RESET}`),
			);
			// Flags
			work = work.replace(/(?<=\s)(--?\w[\w-]*)/g, (m) =>
				token(`${BASH_FLAG}${m}${RESET}`),
			);
			// File paths
			work = work.replace(/(?<=\s)([\w./][\w./-]*\/[\w./-]+)/g, (m) =>
				token(`${BASH_PATH}${m}${RESET}`),
			);
			// Command (first word)
			work = work.replace(
				/^(\s*)([\w.-]+)/,
				(_m, space: string, cmd: string) =>
					`${space}${token(`${BASH_COMMAND}${cmd}${RESET}`)}`,
			);
			// Restore tokens
			work = work.replace(
				/\u00ABT(\d+)\u00BB/g,
				(_m, idx) => tokens[Number(idx)],
			);
			return work;
		})
		.join("\n");
}

// ── Diff highlighting ──

const DIFF_ADD = "\x1B[38;2;172;238;187m"; // #aceebb
const DIFF_DEL = "\x1B[38;2;254;206;202m"; // #fececa
const DIFF_HEADER = "\x1B[36m"; // cyan

function diffLineTransform(line: string): string {
	if (line.startsWith("+")) return `${DIFF_ADD}${line}${RESET}`;
	if (line.startsWith("-")) return `${DIFF_DEL}${line}${RESET}`;
	if (line.startsWith("@@")) return `${DIFF_HEADER}${line}${RESET}`;
	return line;
}

// ── Public API ──

/** Highlight code string for a given language */
export function highlightCode(code: string, language: string): string {
	if (language === "bash" || language === "sh" || language === "shell") {
		return bashHighlight(code);
	}
	try {
		const result = hljs.highlight(code, { language });
		return hljsToAnsi(result.value);
	} catch {
		return code;
	}
}

/** Apply syntax highlighting inside fenced code blocks in markdown */
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
