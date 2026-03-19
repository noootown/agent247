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
			visCount++;
			i++;
		}
	}
	return activeAnsi + text.substring(i);
}

export function fitToWidth(text: string, width: number): string {
	const visible = stripAnsi(text);
	if (visible.length <= width) {
		return text + " ".repeat(width - visible.length);
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
			result += text[i];
			visCount++;
			i++;
		}
	}
	return `${result}…${RESET}`;
}

export function statusIcon(status: string): string {
	switch (status) {
		case "error":
			return `${RED}✗${RESET}`;
		case "completed":
			return `${GREEN}●${RESET}`;
		case "processing":
			return `${YELLOW}${SPINNER[spinnerFrame % SPINNER.length]}${RESET}`;
		case "canceled":
			return `${DIM}✕${RESET}`;
		case "skipped":
			return `${DIM}○${RESET}`;
		default:
			return "○";
	}
}

export function statusText(status: string): string {
	const padded = status.padEnd(10);
	switch (status) {
		case "error":
			return `${RED}${padded}${RESET}`;
		case "completed":
			return `${GREEN}${padded}${RESET}`;
		case "processing":
			return `${YELLOW}${padded}${RESET}`;
		case "canceled":
			return `${DIM}${padded}${RESET}`;
		case "skipped":
			return `${DIM}${padded}${RESET}`;
		default:
			return padded;
	}
}

export function formatTime(iso: string): string {
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
