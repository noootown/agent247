import { describe, expect, it, vi } from "vitest";
import {
	actionOpenUrl,
	actionRun,
	actionSoftDelete,
	actionStop,
	actionToggle,
} from "../actions.js";
import type { State, TaskGroup, VisibleLine, WatchContext } from "../state.js";

const mockConfig = {
	id: "my-task",
	name: "My Task",
	schedule: "* * * * *",
	timeout: 300,
	enabled: true,
	discovery: { command: "echo '[]'", item_key: "url" },
	model: "sonnet",
	prompt_mode: "per_item" as const,
	prompt: "",
};

function makeGroup(overrides: Partial<TaskGroup> = {}): TaskGroup {
	return {
		task: "my-task",
		config: mockConfig,
		runs: [],
		expanded: false,
		running: false,
		enabled: true,
		schedule: null,
		lastCheck: null,
		...overrides,
	};
}

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
		suspend: null,
		layoutMode: "horizontal",
		selected: new Set(),
		followBottom: true,
		flash: null,
		helpScroll: 0,
		...overrides,
	};
}

function makeRunLine(
	status: string,
	dir = "/runs/task/run1",
	url: string | null = "https://example.com/pr/1",
): VisibleLine & { type: "run" } {
	return {
		type: "run",
		index: 0,
		group: makeGroup(),
		run: {
			meta: {
				schema_version: 1,
				id: "01RUN001",
				task: "my-task",
				status: status as never,
				url,
				item_key: url,
				started_at: "2026-03-17T00:00:00Z",
				finished_at: "2026-03-17T00:01:00Z",
				duration_seconds: 60,
				exit_code: 0,
			},
			dir,
			report: undefined,
		},
	};
}

function makeGroupLine(
	overrides: Partial<TaskGroup> = {},
): VisibleLine & { type: "group" } {
	return { type: "group", index: 0, group: makeGroup(overrides) };
}

function makeMockCtx(overrides: Partial<WatchContext> = {}): WatchContext {
	return {
		baseDir: "/base",
		runsDir: "/base/runs",
		binDir: "/base/.bin",
		botName: "agent247",
		reload: (state) => state,
		softDelete: vi.fn(),
		stopTask: vi.fn(),
		toggleTask: vi.fn(),
		spawnRun: vi.fn(),
		spawnRerun: vi.fn(),
		openUrl: vi.fn(),
		...overrides,
	};
}

describe("actionSoftDelete", () => {
	it("calls softDelete with the run dir", () => {
		const line = makeRunLine("completed", "/runs/task/run42");
		const ctx = makeMockCtx();
		actionSoftDelete(makeState(), line, ctx);
		expect(ctx.softDelete).toHaveBeenCalledWith("/runs/task/run42");
	});

	it("no-ops on group lines", () => {
		const ctx = makeMockCtx();
		actionSoftDelete(makeState(), makeGroupLine(), ctx);
		expect(ctx.softDelete).not.toHaveBeenCalled();
	});

	it("no-ops on processing runs", () => {
		const ctx = makeMockCtx();
		actionSoftDelete(makeState(), makeRunLine("processing"), ctx);
		expect(ctx.softDelete).not.toHaveBeenCalled();
	});

	it("clamps cursor when it falls past end of list after delete", () => {
		const ctx = makeMockCtx({
			reload: (s) => ({ ...s, groups: [] }), // empty after delete
		});
		const next = actionSoftDelete(
			makeState({ cursor: 5 }),
			makeRunLine("completed"),
			ctx,
		);
		expect(next.cursor).toBe(0);
	});
});

describe("actionOpenUrl", () => {
	it("calls openUrl for http URLs", () => {
		const ctx = makeMockCtx();
		actionOpenUrl(makeState(), makeRunLine("completed"), ctx);
		expect(ctx.openUrl).toHaveBeenCalledWith("https://example.com/pr/1");
	});

	it("no-ops when URL is null", () => {
		const ctx = makeMockCtx();
		actionOpenUrl(makeState(), makeRunLine("completed", "/dir", null), ctx);
		expect(ctx.openUrl).not.toHaveBeenCalled();
	});

	it("no-ops when URL is not http", () => {
		const line = makeRunLine("completed", "/dir", "ftp://example.com");
		const ctx = makeMockCtx();
		actionOpenUrl(makeState(), line, ctx);
		expect(ctx.openUrl).not.toHaveBeenCalled();
	});

	it("no-ops on group lines", () => {
		const ctx = makeMockCtx();
		actionOpenUrl(makeState(), makeGroupLine(), ctx);
		expect(ctx.openUrl).not.toHaveBeenCalled();
	});

	it("returns state unchanged", () => {
		const state = makeState();
		const ctx = makeMockCtx();
		const next = actionOpenUrl(state, makeRunLine("completed"), ctx);
		expect(next).toBe(state);
	});
});

describe("actionRun", () => {
	it("transitions to confirm-run mode for group lines", () => {
		const next = actionRun(makeState(), makeGroupLine({ task: "my-task" }));
		expect(next.mode).toBe("confirm-run");
		expect(next.confirmTask).toBe("my-task");
		expect(next.confirmChoice).toBe("yes");
	});

	it("no-ops on run lines", () => {
		const state = makeState();
		expect(actionRun(state, makeRunLine("completed"))).toBe(state);
	});
});

describe("actionStop", () => {
	it("enters confirm-stop mode when group is running", () => {
		const next = actionStop(
			makeState(),
			makeGroupLine({ task: "my-task", running: true }),
		);
		expect(next.mode).toBe("confirm-stop");
		expect(next.confirmTask).toBe("my-task");
		expect(next.confirmChoice).toBe("yes");
	});

	it("no-ops when group is not running", () => {
		const state = makeState();
		expect(actionStop(state, makeGroupLine({ running: false }))).toBe(state);
	});

	it("no-ops on run lines", () => {
		const state = makeState();
		expect(actionStop(state, makeRunLine("processing"))).toBe(state);
	});
});

describe("actionToggle", () => {
	it("calls toggleTask and reloads for group lines", () => {
		const reloaded = makeState({ cursor: 1 });
		const ctx = makeMockCtx({ reload: () => reloaded });
		const next = actionToggle(
			makeState(),
			makeGroupLine({ task: "my-task" }),
			ctx,
		);
		expect(ctx.toggleTask).toHaveBeenCalledWith("my-task");
		expect(next).toBe(reloaded);
	});

	it("no-ops on run lines", () => {
		const state = makeState();
		const ctx = makeMockCtx();
		expect(actionToggle(state, makeRunLine("completed"), ctx)).toBe(state);
	});
});
