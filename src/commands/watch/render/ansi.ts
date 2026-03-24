// ── Status config (single source of truth) ──
import type { RunStatus } from "../../../lib/report.js";

export const DIM = "\x1B[2m";
export const BOLD = "\x1B[1m";
export const RESET = "\x1B[0m";
export const SELECT_BG = "\x1B[22m\x1B[30m\x1B[46m";
export const RED = "\x1B[31m";
export const YELLOW = "\x1B[33m";
export const GREEN = "\x1B[32m";
export const MAGENTA = "\x1B[35m";
export const SEPARATOR = "\x1B[90m│\x1B[0m";
export const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

const IN_TMUX = !!process.env.TMUX;

export function hyperlink(url: string, text: string): string {
	if (IN_TMUX) return text;
	return `\x1B]8;;${url}\x07${text}\x1B]8;;\x07`;
}

let spinnerFrame = 0;

export function tickSpinner(): void {
	spinnerFrame++;
}

export function getSpinnerFrame(): number {
	return spinnerFrame;
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escape sequences
const ANSI_RE = /\x1B\[[0-9;]*m/g;
// biome-ignore lint/suspicious/noControlCharactersInRegex: stripping OSC hyperlink sequences
const OSC_RE = /\x1B\]8;;[^\x07]*\x07/g;

export function stripAnsi(str: string): string {
	return str.replace(ANSI_RE, "").replace(OSC_RE, "");
}

/** Returns the terminal display width of a single Unicode code point (0, 1, or 2 columns). */
function charWidth(cp: number): number {
	// Zero-width: combining chars, variation selectors, ZWJ, ZWS
	if (
		(cp >= 0x0300 && cp <= 0x036f) || // Combining Diacritical Marks
		(cp >= 0x200b && cp <= 0x200d) || // ZWS, ZWNJ, ZWJ
		cp === 0xfeff || // BOM / ZWNBSP
		(cp >= 0xfe00 && cp <= 0xfe0f) || // Variation Selectors
		(cp >= 0x1f3fb && cp <= 0x1f3ff) || // Emoji skin tone modifiers
		(cp >= 0xe0100 && cp <= 0xe01ef) // Variation Selectors Supplement
	) {
		return 0;
	}
	if (cp < 0x1100) return 1;
	if (
		(cp >= 0x1100 && cp <= 0x115f) || // Hangul Jamo
		cp === 0x2329 ||
		cp === 0x232a ||
		(cp >= 0x2600 && cp <= 0x27bf) || // Misc Symbols + Dingbats (✅ ❌ ⚾ etc.)
		(cp >= 0x2b50 && cp <= 0x2b55) || // Stars/circles
		(cp >= 0x2e80 && cp <= 0x303e) || // CJK Radicals
		(cp >= 0x3040 && cp <= 0x33ff) || // Japanese
		(cp >= 0x3400 && cp <= 0x4dbf) || // CJK Extension A
		(cp >= 0x4e00 && cp <= 0xa4c6) || // CJK Unified
		(cp >= 0xa960 && cp <= 0xa97c) ||
		(cp >= 0xac00 && cp <= 0xd7a3) || // Hangul
		(cp >= 0xf900 && cp <= 0xfaff) || // CJK Compatibility
		(cp >= 0xfe10 && cp <= 0xfe19) ||
		(cp >= 0xfe30 && cp <= 0xfe6b) ||
		(cp >= 0xff01 && cp <= 0xff60) || // Fullwidth ASCII
		(cp >= 0xffe0 && cp <= 0xffe6) ||
		(cp >= 0x1f004 && cp <= 0x1faff) || // Emoji (most)
		(cp >= 0x20000 && cp <= 0x2fffd) ||
		(cp >= 0x30000 && cp <= 0x3fffd)
	) {
		return 2;
	}
	return 1;
}

/** Returns the visible terminal column width of a plain (ANSI-stripped) string. */
export function visibleWidth(str: string): number {
	let width = 0;
	for (let i = 0; i < str.length; ) {
		const cp = str.codePointAt(i) ?? 0;
		width += charWidth(cp);
		i += cp > 0xffff ? 2 : 1;
	}
	return width;
}

export function scrollAnsi(text: string, skip: number): string {
	if (skip <= 0) return text;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI/OSC sequences
	const ansiPattern = /\x1B\[[0-9;]*m|\x1B\]8;;[^\x07]*\x07/g;
	let visCount = 0;
	let i = 0;
	let activeAnsi = "";
	while (i < text.length && visCount < skip) {
		ansiPattern.lastIndex = i;
		const match = ansiPattern.exec(text);
		if (match && match.index === i) {
			if (match[0] === "\x1B[0m") {
				activeAnsi = "";
			} else if (match[0].startsWith("\x1B[")) {
				activeAnsi += match[0];
			}
			i += match[0].length;
		} else {
			const cp = text.codePointAt(i) ?? 0;
			visCount += charWidth(cp);
			i += cp > 0xffff ? 2 : 1;
		}
	}
	return activeAnsi + text.substring(i);
}

export function fitToWidth(text: string, width: number): string {
	const visible = stripAnsi(text);
	if (visibleWidth(visible) <= width) {
		return text + " ".repeat(width - visibleWidth(visible));
	}
	let visCount = 0;
	let i = 0;
	// biome-ignore lint/suspicious/noControlCharactersInRegex: matching ANSI/OSC sequences
	const ansiPattern = /\x1B\[[0-9;]*m|\x1B\]8;;[^\x07]*\x07/g;
	let result = "";
	while (i < text.length && visCount < width - 1) {
		ansiPattern.lastIndex = i;
		const match = ansiPattern.exec(text);
		if (match && match.index === i) {
			result += match[0];
			i += match[0].length;
		} else {
			const cp = text.codePointAt(i) ?? 0;
			const w = charWidth(cp);
			if (visCount + w > width - 1) break;
			result += String.fromCodePoint(cp);
			visCount += w;
			i += cp > 0xffff ? 2 : 1;
		}
	}
	return `${result}…${RESET}`;
}

interface StatusConfig {
	icon: string;
	color: string;
}

const STATUS_MAP: Record<RunStatus, StatusConfig> = {
	error: { icon: "x", color: RED },
	completed: { icon: "●", color: GREEN },
	processing: { icon: "◌", color: YELLOW },
	canceled: { icon: "-", color: DIM },
};

const DEFAULT_STATUS: StatusConfig = { icon: "○", color: "" };

function getStatusConfig(status: string): StatusConfig {
	return STATUS_MAP[status as RunStatus] ?? DEFAULT_STATUS;
}

export function statusPlainIcon(status: string): string {
	return getStatusConfig(status).icon;
}

export function statusIcon(status: string): string {
	if (status === "processing") {
		return `${YELLOW}${SPINNER[spinnerFrame % SPINNER.length]}${RESET}`;
	}
	const { icon, color } = getStatusConfig(status);
	return color ? `${color}${icon}${RESET}` : icon;
}

export function statusText(status: string): string {
	const padded = status.padEnd(10);
	const { color } = getStatusConfig(status);
	return color ? `${color}${padded}${RESET}` : padded;
}

export function formatTime(iso: string): string {
	const d = new Date(iso);
	const year = d.getFullYear();
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hour = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	const sec = String(d.getSeconds()).padStart(2, "0");
	return `${year}/${month}/${day} ${hour}:${min}:${sec}`;
}

export function formatTimeShort(iso: string): string {
	const d = new Date(iso);
	const month = String(d.getMonth() + 1).padStart(2, "0");
	const day = String(d.getDate()).padStart(2, "0");
	const hour = String(d.getHours()).padStart(2, "0");
	const min = String(d.getMinutes()).padStart(2, "0");
	return `${month}/${day} ${hour}:${min}`;
}

export function formatAgo(timestamp: number): string {
	const diff = Math.round((Date.now() - timestamp) / 1000);
	if (diff < 60) return `${diff}s ago`;
	if (diff < 3600) return `${Math.round(diff / 60)}m ago`;
	if (diff < 86400) return `${Math.round(diff / 3600)}h ago`;
	return `${Math.round(diff / 86400)}d ago`;
}
