import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface HotkeyConfig {
	key: string;
	command: string;
	description: string;
}

export interface HotkeySettings {
	hotkeys: HotkeyConfig[];
	metaKey: string | null; // raw terminal byte for the meta key, null if not configured
	metaKeyLabel: string; // human-readable label, e.g. "Ctrl+S"
	warnings: string[];
}

export function loadHotkeys(baseDir: string): HotkeySettings {
	const defaults: HotkeySettings = {
		hotkeys: [],
		metaKey: null,
		metaKeyLabel: "",
		warnings: [],
	};

	const settingsPath = join(baseDir, "settings.yaml");
	if (!existsSync(settingsPath)) return defaults;

	const raw = yaml.load(readFileSync(settingsPath, "utf-8")) as Record<
		string,
		unknown
	>;
	if (!raw || typeof raw !== "object") return defaults;

	const warnings: string[] = [];

	// Parse meta_key — expects a single letter, e.g. "s"
	let metaKey: string | null = null;
	let metaKeyLabel = "";
	if (typeof raw.meta_key === "string") {
		const letter = raw.meta_key.trim().toLowerCase();
		if (/^[a-z]$/.test(letter)) {
			metaKey = letterToCtrlByte(letter);
			metaKeyLabel = letterToCtrlLabel(letter);
		} else {
			warnings.push(
				`meta_key "${raw.meta_key}": must be a single letter (a-z), skipping`,
			);
		}
	}

	if (!raw.hotkeys) {
		return { hotkeys: [], metaKey, metaKeyLabel, warnings };
	}

	const entries = raw.hotkeys as Record<string, unknown>;
	const hotkeys: HotkeyConfig[] = [];

	for (const [key, value] of Object.entries(entries)) {
		if (typeof value !== "object" || value === null) {
			warnings.push(`Hotkey "${key}": invalid entry, skipping`);
			continue;
		}
		const entry = value as Record<string, unknown>;

		if (typeof entry.command !== "string" || !entry.command) {
			warnings.push(`Hotkey "${key}": missing command, skipping`);
			continue;
		}

		if (typeof entry.description !== "string" || !entry.description) {
			warnings.push(`Hotkey "${key}": missing description, skipping`);
			continue;
		}

		hotkeys.push({
			key,
			command: entry.command,
			description: entry.description,
		});
	}

	return { hotkeys, metaKey, metaKeyLabel, warnings };
}

function letterToCtrlByte(letter: string): string {
	return String.fromCharCode(letter.charCodeAt(0) - 96);
}

function letterToCtrlLabel(letter: string): string {
	return `Ctrl+${letter.toUpperCase()}`;
}
