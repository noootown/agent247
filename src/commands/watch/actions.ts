import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { FILE } from "../../lib/constants.js";
import { updateRunMeta } from "../../lib/report.js";
import type { HotkeyConfig } from "./settings.js";
import {
	RUN_TABS,
	type State,
	type VisibleLine,
	type WatchContext,
} from "./state.js";

export function actionSoftDelete(
	state: State,
	line: VisibleLine,
	ctx: WatchContext,
): State {
	if (line.type !== "run" || line.run.meta.status === "processing")
		return state;
	ctx.softDelete(line.run.dir);
	let next = ctx.reload(state);
	const visibleCount = next.groups.reduce(
		(sum, g) => sum + 1 + (g.expanded ? g.runs.length : 0),
		0,
	);
	if (next.cursor >= visibleCount) {
		next = { ...next, cursor: Math.max(0, visibleCount - 1) };
	}
	return next;
}

export function actionOpenUrl(
	state: State,
	line: VisibleLine,
	ctx: WatchContext,
): State {
	const url = line.type === "run" ? line.run.meta.url : null;
	if (url?.startsWith("http")) ctx.openUrl(url);
	return state;
}

export function actionRun(state: State, line: VisibleLine): State {
	if (line.type !== "group") return state;
	return {
		...state,
		mode: "confirm-run",
		confirmTask: line.group.task,
		confirmChoice: "yes",
	};
}

export function actionRerun(state: State, line: VisibleLine): State {
	if (line.type !== "run" || !line.run.meta.item_key) return state;
	return {
		...state,
		mode: "confirm-rerun",
		confirmTask: line.run.meta.task,
		confirmItemKey: line.run.meta.item_key,
		confirmChoice: "yes",
	};
}

export function actionStop(state: State, line: VisibleLine): State {
	if (line.type !== "group" || !line.group.running) return state;
	return {
		...state,
		mode: "confirm-stop",
		confirmTask: line.group.task,
		confirmChoice: "yes",
	};
}

export function getRunCwd(line: VisibleLine): string | null {
	if (line.type !== "run") return null;
	const dataPath = join(line.run.dir, FILE.DATA);
	if (!existsSync(dataPath)) return null;
	try {
		const data = JSON.parse(readFileSync(dataPath, "utf-8"));
		const cwd = data.config?.cwd;
		if (!cwd || !existsSync(cwd)) return null;
		return cwd;
	} catch {
		return null;
	}
}

export function actionToggle(
	state: State,
	line: VisibleLine,
	ctx: WatchContext,
): State {
	if (line.type !== "group") return state;
	ctx.toggleTask(line.group.task);
	return ctx.reload(state);
}

export function actionMark(
	state: State,
	line: VisibleLine,
	ctx: WatchContext,
): State {
	if (line.type !== "run") return state;
	const newMarked = !line.run.meta.marked;
	updateRunMeta(line.run.dir, { marked: newMarked });
	return ctx.reload(state);
}

export function actionToggleMarkedFilter(state: State): State {
	const entering = !state.showMarkedOnly;
	for (const g of state.groups) g.expanded = entering;
	return {
		...state,
		showMarkedOnly: entering,
		cursor: 0,
		flash: entering ? "Showing marked only" : "Showing all runs",
	};
}

export function actionCustomHotkey(
	state: State,
	line: VisibleLine,
	hotkey: HotkeyConfig,
	ctx: WatchContext,
): State {
	const cwd = getRunCwd(line) ?? ctx.baseDir;

	// Build template variables from run context
	const vars: Record<string, string> = { cwd };
	if (line.type === "run") {
		const tabName = RUN_TABS[state.activeTab] ?? FILE.REPORT;
		const tabFile = tabName.includes(".")
			? join(line.run.dir, tabName)
			: join(line.run.dir, FILE.DATA);
		vars.tab_file_path = tabFile;
		vars.run_dir = line.run.dir;
		vars.task = line.run.meta.task;
		vars.item_key = line.run.meta.item_key ?? "";
		vars.url = line.run.meta.url ?? "";

		// Extract session_id from data.json result
		try {
			const dataPath = join(line.run.dir, FILE.DATA);
			const data = JSON.parse(readFileSync(dataPath, "utf-8"));
			vars.session_id = data.result?.session_id ?? "";
		} catch {
			vars.session_id = "";
		}
	} else {
		vars.tab_file_path = "";
		vars.run_dir = "";
		vars.task = line.type === "group" ? line.group.task : "";
		vars.item_key = "";
		vars.url = "";
	}

	// Render template variables in command
	const command = hotkey.command.replace(
		/\{\{(\w+)\}\}/g,
		(_, key) => vars[key] ?? "",
	);

	spawn(command, { shell: true, cwd, stdio: "ignore" } as never);

	return state;
}
