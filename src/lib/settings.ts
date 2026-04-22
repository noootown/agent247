import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";

export interface HotkeyConfig {
	key: string;
	command: string;
	description: string;
}

export interface Settings {
	hotkeys: HotkeyConfig[];
	metaKey: string | null; // raw terminal byte for the meta key, null if not configured
	metaKeyLabel: string; // human-readable label, e.g. "Ctrl+S"
	modelAliases: Record<string, string>; // short alias (e.g. "opus") → full model id (e.g. "claude-opus-4-6")
	warnings: string[];
}

export function resolveModel(
	alias: string,
	aliases: Record<string, string>,
): string {
	return aliases[alias] ?? alias;
}

export function loadSettings(baseDir: string): Settings {
	const defaults: Settings = {
		hotkeys: [],
		metaKey: null,
		metaKeyLabel: "",
		modelAliases: {},
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

	const hotkeys: HotkeyConfig[] = [];
	if (raw.hotkeys && typeof raw.hotkeys === "object") {
		const entries = raw.hotkeys as Record<string, unknown>;
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
	}

	const modelAliases: Record<string, string> = {};
	if (raw.models !== undefined) {
		if (
			typeof raw.models !== "object" ||
			raw.models === null ||
			Array.isArray(raw.models)
		) {
			warnings.push(`models: must be a map, skipping`);
		} else {
			const entries = raw.models as Record<string, unknown>;
			for (const [alias, value] of Object.entries(entries)) {
				if (typeof value !== "string" || value === "") {
					warnings.push(
						`models.${alias}: must be a non-empty string, skipping`,
					);
					continue;
				}
				modelAliases[alias] = value;
			}
		}
	}

	return {
		hotkeys,
		metaKey,
		metaKeyLabel,
		modelAliases,
		warnings,
	};
}

function letterToCtrlByte(letter: string): string {
	return String.fromCharCode(letter.charCodeAt(0) - 96);
}

function letterToCtrlLabel(letter: string): string {
	return `Ctrl+${letter.toUpperCase()}`;
}
