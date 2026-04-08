import type { TaskConfig } from "../../lib/config.js";
import { FILE } from "../../lib/constants.js";
import type { RunRecord } from "../../lib/report.js";
import type { HotkeyConfig } from "./settings.js";

export type ViewMode =
	| "split"
	| "help"
	| "search"
	| "confirm-run"
	| "confirm-rerun"
	| "confirm-stop"
	| "confirm-delete";

export interface TaskGroup {
	task: string;
	config: TaskConfig;
	runs: RunRecord[];
	expanded: boolean;
	running: boolean;
	enabled: boolean;
	schedule: string | null;
	lastCheck: string | null;
}

export type VisibleLine =
	| { type: "group"; group: TaskGroup; index: number }
	| { type: "run"; run: RunRecord; group: TaskGroup; index: number };

export const RUN_TABS = [
	FILE.REPORT,
	FILE.TRANSCRIPT,
	FILE.PROMPT,
	"run",
	FILE.LOG,
	"data",
] as const;

export const TAB_NAMES = [
	"report",
	"transcript",
	"prompt",
	"run",
	"log",
	"data",
];

export type RunTab = (typeof RUN_TABS)[number];

export interface State {
	groups: TaskGroup[];
	cursor: number;
	scroll: number;
	mode: ViewMode;
	splitRun: RunRecord | null;
	activeTab: number;
	fullPane: boolean;
	reportScroll: number;
	reportScrollX: number;
	confirmTask: string | null;
	confirmItemKey: string | null;
	confirmChoice: "yes" | "no";
	layoutMode: "vertical" | "horizontal";
	selected: Set<number>;
	followBottom: boolean;
	flash: string | null;
	helpScroll: number;
	showMarkedOnly: boolean;
	prefixMode: boolean;
	searchQuery: string;
	searchConfirmed: boolean;
}

export interface WatchContext {
	baseDir: string;
	runsDir: string;
	binDir: string;
	botName: string;
	reload: (state: State) => State;
	softDelete: (runDir: string) => void;
	stopTask: (taskId: string) => void;
	toggleTask: (taskId: string) => void;
	spawnRun: (taskId: string) => void;
	spawnRerun: (taskId: string, itemKey: string) => void;
	openUrl: (url: string) => void;
	hotkeys: HotkeyConfig[];
	metaKey: string | null;
	metaKeyLabel: string;
}

export function initialState(): State {
	return {
		groups: [],
		cursor: -1,
		scroll: 0,
		mode: "split",
		splitRun: null,
		activeTab: 0,
		fullPane: false,
		reportScroll: 0,
		reportScrollX: 0,
		confirmTask: null,
		confirmItemKey: null,
		confirmChoice: "yes",
		layoutMode: "horizontal",
		selected: new Set(),
		followBottom: true,
		flash: null,
		helpScroll: 0,
		showMarkedOnly: false,
		prefixMode: false,
		searchQuery: "",
		searchConfirmed: false,
	};
}
