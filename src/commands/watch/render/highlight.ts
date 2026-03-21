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
		.replace(/&#x27;/g, "'")
		.replace(/&#39;/g, "'")
		.replace(/&amp;/g, "&")
		.replace(/&lt;/g, "<")
		.replace(/&gt;/g, ">")
		.replace(/&quot;/g, '"');
	return result;
}

// ── Custom bash highlighter ──

const BASH_COMMAND = "\x1B[38;2;152;195;121m"; // green

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

/** Minimal bash fallback: color first word as command for lines highlight.js missed */
function bashFallbackLine(line: string): string {
	if (line.includes("\x1B[")) return line;
	return line.replace(/^(\s*)([\w./-]+)/, `$1${BASH_COMMAND}$2${RESET}`);
}

/** Highlight code string for a given language */
export function highlightCode(code: string, language: string): string {
	try {
		const result = hljs.highlight(code, { language });
		let ansi = hljsToAnsi(result.value);
		// For bash: apply fallback coloring to lines highlight.js left completely plain
		if (language === "bash" || language === "sh" || language === "shell") {
			ansi = ansi.split("\n").map(bashFallbackLine).join("\n");
		}
		return ansi;
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
			const label = ` ${activeLang} `;
			const side = "─".repeat(10);
			result.push(`${DIM}${side}${label}${side}${RESET}`);
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
			const closingWidth = 10 + activeLang.length + 2 + 10;
			result.push(`${DIM}${"─".repeat(closingWidth)}${RESET}`);
			activeLang = null;
			blockLines = [];
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
