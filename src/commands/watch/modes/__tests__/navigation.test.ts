import { describe, expect, it, vi } from "vitest";
import type {
	State,
	TaskGroup,
	VisibleLine,
	WatchContext,
} from "../../state.js";
import { handleKey } from "../split.js";

function makeState(overrides: Partial<State> = {}): State {
	return {
		groups: [],
		cursor: 0,
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
		...overrides,
	};
}

function makeGroup(task = "task-a", running = false): TaskGroup {
	return {
		task,
		config: {
			id: task,
			name: task,
			schedule: "* * * * *",
			timeout: 300,
			enabled: true,
			discovery: { command: "echo '[]'", item_key: "url" },
			model: "sonnet",
			prompt: "",
		},
		runs: [],
		expanded: false,
		running,
		enabled: true,
		schedule: null,
		lastCheck: null,
	};
}

function makeGroupLine(
	task = "task-a",
	idx = 0,
	expanded = false,
): VisibleLine {
	const group = makeGroup(task);
	group.expanded = expanded;
	return { type: "group", group, index: idx };
}

function makeRunLine(idx = 0, status = "completed"): VisibleLine {
	return {
		type: "run",
		group: makeGroup(),
		index: idx,
		run: {
			meta: {
				schema_version: 1,
				id: "01RUN001",
				task: "task-a",
				status: status as never,
				url: "https://example.com",
				item_key: "https://example.com",
				started_at: "2026-03-17T00:00:00Z",
				finished_at: "2026-03-17T00:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			dir: "/runs/task-a/01RUN001",
			report: undefined,
		},
	};
}

function makeMockCtx(overrides: Partial<WatchContext> = {}): WatchContext {
	return {
		baseDir: "/base",
		runsDir: "/base/runs",
		binDir: "/base/.bin",
		botName: "agent247",
		reload: (s) => s,
		softDelete: vi.fn(),
		stopTask: vi.fn(),
		toggleTask: vi.fn(),
		spawnRun: vi.fn(),
		spawnRerun: vi.fn(),
		openUrl: vi.fn(),
		hotkeys: [],
		metaKey: "\x13",
		metaKeyLabel: "Ctrl+S",
		...overrides,
	};
}

describe("navigation", () => {
	it("↑ decrements cursor", () => {
		const lines = [makeGroupLine("a", 0), makeGroupLine("b", 1)];
		expect(
			handleKey("\x1B[A", makeState({ cursor: 1 }), lines, makeMockCtx())
				.cursor,
		).toBe(0);
	});

	it("↑ wraps from first to last", () => {
		const lines = [makeGroupLine("a", 0), makeGroupLine("b", 1)];
		expect(
			handleKey("\x1B[A", makeState({ cursor: 0 }), lines, makeMockCtx())
				.cursor,
		).toBe(1);
	});

	it("↓ increments cursor", () => {
		const lines = [makeGroupLine("a", 0), makeGroupLine("b", 1)];
		expect(
			handleKey("\x1B[B", makeState({ cursor: 0 }), lines, makeMockCtx())
				.cursor,
		).toBe(1);
	});

	it("↓ wraps from last to first", () => {
		const lines = [makeGroupLine("a", 0), makeGroupLine("b", 1)];
		expect(
			handleKey("\x1B[B", makeState({ cursor: 1 }), lines, makeMockCtx())
				.cursor,
		).toBe(0);
	});

	it("→ expands a collapsed group", () => {
		const lines = [makeGroupLine("task-a", 0, false)];
		handleKey("\x1B[C", makeState({ cursor: 0 }), lines, makeMockCtx());
		expect(
			(lines[0] as Extract<VisibleLine, { type: "group" }>).group.expanded,
		).toBe(true);
	});

	it("→ on a run is a no-op", () => {
		const lines = [makeRunLine(0)];
		const state = makeState({ cursor: 0 });
		const next = handleKey("\x1B[C", state, lines, makeMockCtx());
		expect(next).toBe(state);
	});

	it("← collapses an expanded group", () => {
		const lines = [makeGroupLine("task-a", 0, true)];
		handleKey("\x1B[D", makeState({ cursor: 0 }), lines, makeMockCtx());
		expect(
			(lines[0] as Extract<VisibleLine, { type: "group" }>).group.expanded,
		).toBe(false);
	});
});

describe("mode transitions", () => {
	it("Enter on a run is a no-op", () => {
		const lines = [makeRunLine(0)];
		const state = makeState({ cursor: 0 });
		const next = handleKey("\r", state, lines, makeMockCtx());
		expect(next).toBe(state);
	});

	it("Enter on a group toggles expand", () => {
		const lines = [makeGroupLine("task-a", 0, false)];
		handleKey("\r", makeState({ cursor: 0 }), lines, makeMockCtx());
		expect(
			(lines[0] as Extract<VisibleLine, { type: "group" }>).group.expanded,
		).toBe(true);
	});

	it("? opens help mode", () => {
		expect(handleKey("?", makeState(), [], makeMockCtx()).mode).toBe("help");
	});

	it("r on a group opens confirm-run mode", () => {
		const lines = [makeGroupLine("task-a", 0)];
		const next = handleKey("r", makeState({ cursor: 0 }), lines, makeMockCtx());
		expect(next.mode).toBe("confirm-run");
		expect(next.confirmTask).toBe("task-a");
	});
});

describe("action hotkeys", () => {
	it("u calls openUrl for http URLs", () => {
		const lines = [makeRunLine(0)];
		const ctx = makeMockCtx();
		handleKey("u", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.openUrl).toHaveBeenCalledWith("https://example.com");
	});

	it("x on a running group enters confirm-stop mode", () => {
		const group = makeGroup("task-a", true);
		const lines: VisibleLine[] = [{ type: "group", group, index: 0 }];
		const ctx = makeMockCtx();
		const next = handleKey("x", makeState({ cursor: 0 }), lines, ctx);
		expect(next.mode).toBe("confirm-stop");
		expect(next.confirmTask).toBe("task-a");
	});

	it("t on a group calls toggleTask", () => {
		const lines = [makeGroupLine("task-a", 0)];
		const ctx = makeMockCtx();
		handleKey("t", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.toggleTask).toHaveBeenCalledWith("task-a");
	});

	it("x on a non-processing run shows confirm-delete", () => {
		const lines = [makeRunLine(0, "completed")];
		const ctx = makeMockCtx();
		const next = handleKey("x", makeState({ cursor: 0 }), lines, ctx);
		expect(next.mode).toBe("confirm-delete");
		expect(next.selected.has(0)).toBe(true);
	});

	it("x no-ops on processing runs", () => {
		const lines = [makeRunLine(0, "processing")];
		const ctx = makeMockCtx();
		const next = handleKey("x", makeState({ cursor: 0 }), lines, ctx);
		expect(next.mode).toBe("split");
	});
});
