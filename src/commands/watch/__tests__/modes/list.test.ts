import { describe, expect, it, vi } from "vitest";
import { handleKey } from "../../modes/list.js";
import type {
	State,
	TaskGroup,
	VisibleLine,
	WatchContext,
} from "../../state.js";

function makeState(overrides: Partial<State> = {}): State {
	return {
		groups: [],
		cursor: 0,
		scroll: 0,
		mode: "list",
		splitRun: null,
		reportScroll: 0,
		reportScrollX: 0,
		confirmTask: null,
		confirmChoice: "yes",
		...overrides,
	};
}

function makeGroup(task = "task-a", running = false): TaskGroup {
	return {
		task,
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
		persistRunMeta: vi.fn(),
		softDelete: vi.fn(),
		stopTask: vi.fn(),
		toggleTask: vi.fn(),
		spawnRun: vi.fn(),
		openUrl: vi.fn(),
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

	it("→ on a run opens split mode", () => {
		const lines = [makeRunLine(0)];
		const next = handleKey(
			"\x1B[C",
			makeState({ cursor: 0 }),
			lines,
			makeMockCtx(),
		);
		expect(next.mode).toBe("split");
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
	it("Enter on a run opens split mode", () => {
		const lines = [makeRunLine(0)];
		const next = handleKey(
			"\r",
			makeState({ cursor: 0 }),
			lines,
			makeMockCtx(),
		);
		expect(next.mode).toBe("split");
		expect(next.splitRun).toBeDefined();
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
	it("c on a pending run calls persistRunMeta", () => {
		const lines = [makeRunLine(0, "pending")];
		const ctx = makeMockCtx();
		handleKey("c", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.persistRunMeta).toHaveBeenCalled();
	});

	it("p on a completed run calls persistRunMeta", () => {
		const lines = [makeRunLine(0, "completed")];
		const ctx = makeMockCtx();
		handleKey("p", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.persistRunMeta).toHaveBeenCalled();
	});

	it("u calls openUrl for http URLs", () => {
		const lines = [makeRunLine(0)];
		const ctx = makeMockCtx();
		handleKey("u", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.openUrl).toHaveBeenCalledWith("https://example.com");
	});

	it("x on a running group calls stopTask", () => {
		const group = makeGroup("task-a", true);
		const lines: VisibleLine[] = [{ type: "group", group, index: 0 }];
		const ctx = makeMockCtx();
		handleKey("x", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.stopTask).toHaveBeenCalledWith("task-a");
	});

	it("t on a group calls toggleTask", () => {
		const lines = [makeGroupLine("task-a", 0)];
		const ctx = makeMockCtx();
		handleKey("t", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.toggleTask).toHaveBeenCalledWith("task-a");
	});

	it("Delete on a non-processing run calls softDelete", () => {
		const lines = [makeRunLine(0, "completed")];
		const ctx = makeMockCtx();
		handleKey("\x1B[3~", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.softDelete).toHaveBeenCalled();
	});

	it("Delete no-ops on processing runs", () => {
		const lines = [makeRunLine(0, "processing")];
		const ctx = makeMockCtx();
		handleKey("\x1B[3~", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.softDelete).not.toHaveBeenCalled();
	});
});
