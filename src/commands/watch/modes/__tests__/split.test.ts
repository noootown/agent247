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
		confirmChoice: "yes",
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
			prompt_mode: "per_item" as const,
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
		softDelete: vi.fn(),
		stopTask: vi.fn(),
		toggleTask: vi.fn(),
		spawnRun: vi.fn(),
		openUrl: vi.fn(),
		...overrides,
	};
}

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
