import { describe, expect, it, vi } from "vitest";
import { handleKey } from "../../modes/split.js";
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
		mode: "split",
		splitRun: null,
		reportScroll: 0,
		reportScrollX: 0,
		confirmTask: null,
		confirmChoice: "yes",
		...overrides,
	};
}

function makeGroup(task = "task-a", running = false): TaskGroup {
	return { task, runs: [], expanded: false, running, enabled: true };
}

function makeGroupLine(task = "task-a", idx = 0): VisibleLine {
	return { type: "group", group: makeGroup(task), index: idx };
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

describe("exit split mode", () => {
	it("q exits split mode", () => {
		const next = handleKey("q", makeState(), [], makeMockCtx());
		expect(next.mode).toBe("list");
		expect(next.splitRun).toBeNull();
	});

	it("ESC exits split mode", () => {
		const next = handleKey("\x1B", makeState(), [], makeMockCtx());
		expect(next.mode).toBe("list");
	});

	it("← on a run line exits split mode", () => {
		const lines = [makeRunLine(0)];
		const next = handleKey(
			"\x1B[D",
			makeState({ cursor: 0 }),
			lines,
			makeMockCtx(),
		);
		expect(next.mode).toBe("list");
	});
});

describe("navigation in split mode", () => {
	it("↑ decrements cursor and updates splitRun", () => {
		const run = makeRunLine(1);
		const lines = [makeGroupLine("a", 0), run];
		const next = handleKey(
			"\x1B[A",
			makeState({ cursor: 1 }),
			lines,
			makeMockCtx(),
		);
		expect(next.cursor).toBe(0);
		expect(next.splitRun).toBeNull(); // group line has no run
	});

	it("↓ increments cursor and updates splitRun", () => {
		const run = makeRunLine(1);
		const lines = [makeGroupLine("a", 0), run];
		const next = handleKey(
			"\x1B[B",
			makeState({ cursor: 0 }),
			lines,
			makeMockCtx(),
		);
		expect(next.cursor).toBe(1);
		if (run.type === "run") {
			expect(next.splitRun).toBe(run.run);
		}
	});
});

describe("report scrolling", () => {
	it("w decrements reportScroll (min 0)", () => {
		expect(
			handleKey("w", makeState({ reportScroll: 3 }), [], makeMockCtx())
				.reportScroll,
		).toBe(2);
		expect(
			handleKey("w", makeState({ reportScroll: 0 }), [], makeMockCtx())
				.reportScroll,
		).toBe(0);
	});

	it("s increments reportScroll", () => {
		expect(
			handleKey("s", makeState({ reportScroll: 0 }), [], makeMockCtx())
				.reportScroll,
		).toBe(1);
	});

	it("a decrements reportScrollX (min 0)", () => {
		expect(
			handleKey("a", makeState({ reportScrollX: 8 }), [], makeMockCtx())
				.reportScrollX,
		).toBe(4);
		expect(
			handleKey("a", makeState({ reportScrollX: 0 }), [], makeMockCtx())
				.reportScrollX,
		).toBe(0);
	});

	it("d increments reportScrollX", () => {
		expect(
			handleKey("d", makeState({ reportScrollX: 0 }), [], makeMockCtx())
				.reportScrollX,
		).toBe(4);
	});
});

describe("action hotkeys in split mode", () => {
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

	it("u calls openUrl", () => {
		const lines = [makeRunLine(0)];
		const ctx = makeMockCtx();
		handleKey("u", makeState({ cursor: 0 }), lines, ctx);
		expect(ctx.openUrl).toHaveBeenCalledWith("https://example.com");
	});

	it("? opens help mode", () => {
		expect(handleKey("?", makeState(), [], makeMockCtx()).mode).toBe("help");
	});
});
