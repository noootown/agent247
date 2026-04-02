import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface HotkeyConfig {
	key: string;
	type: "tmux" | "exec";
	command: string;
	description: string;
}

const BUILT_IN_KEYS = new Set([
	"r",
	"x",
	"t",
	"m",
	"M",
	"u",
	"f",
	"l",
	"z",
	"j",
	"w",
	"a",
	"s",
	"d",
	"q",
	"?",
	"1",
	"2",
	"3",
	"4",
	"5",
	"6",
]);

export function loadHotkeys(baseDir: string): {
	hotkeys: HotkeyConfig[];
	warnings: string[];
} {
	const settingsPath = join(baseDir, "settings.yaml");
	if (!existsSync(settingsPath)) return { hotkeys: [], warnings: [] };

	const raw = yaml.load(readFileSync(settingsPath, "utf-8")) as Record<
		string,
		unknown
	>;
	if (!raw || typeof raw !== "object" || !raw.hotkeys) {
		return { hotkeys: [], warnings: [] };
	}

	const entries = raw.hotkeys as Record<string, unknown>;
	const hotkeys: HotkeyConfig[] = [];
	const warnings: string[] = [];

	for (const [key, value] of Object.entries(entries)) {
		if (typeof value !== "object" || value === null) {
			warnings.push(`Hotkey "${key}": invalid entry, skipping`);
			continue;
		}
		const entry = value as Record<string, unknown>;

		if (BUILT_IN_KEYS.has(key)) {
			warnings.push(`Hotkey "${key}" collides with built-in key, skipping`);
			continue;
		}

		if (entry.type !== "tmux" && entry.type !== "exec") {
			warnings.push(`Hotkey "${key}": type must be "tmux" or "exec", skipping`);
			continue;
		}

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
			type: entry.type,
			command: entry.command,
			description: entry.description,
		});
	}

	return { hotkeys, warnings };
}
