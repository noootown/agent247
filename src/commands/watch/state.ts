import type { TaskConfig } from "../../lib/config.js";
import type { RunRecord } from "../../lib/report.js";

export type ViewMode = "split" | "help" | "confirm-run";

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
	"report.md",
	"transcript.md",
	"prompt.rendered.md",
	"log.txt",
	"meta.yaml",
	"vars.json",
	"response.json",
] as const;

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
	confirmChoice: "yes" | "no";
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
	openUrl: (url: string) => void;
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
		confirmChoice: "yes",
	};
}
