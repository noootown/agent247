import { describe, expect, it, vi } from "vitest";
import {
	actionComplete,
	actionOpenUrl,
	actionPending,
	actionRun,
	actionSoftDelete,
	actionStop,
	actionToggle,
} from "../actions.js";
import type { State, TaskGroup, VisibleLine, WatchContext } from "../state.js";

function makeGroup(overrides: Partial<TaskGroup> = {}): TaskGroup {
	return {
		task: "my-task",
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
		mode: "list",
		splitRun: null,
		reportScroll: 0,
		reportScrollX: 0,
		confirmTask: null,
		confirmChoice: "yes",
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
		persistRunMeta: vi.fn(),
		softDelete: vi.fn(),
		stopTask: vi.fn(),
		toggleTask: vi.fn(),
		spawnRun: vi.fn(),
		openUrl: vi.fn(),
		...overrides,
	};
}

describe("actionComplete", () => {
	it("marks a pending run as completed and persists", () => {
		const line = makeRunLine("pending");
		const ctx = makeMockCtx();
		actionComplete(makeState(), line, ctx);
		expect(line.run.meta.status).toBe("completed");
		expect(ctx.persistRunMeta).toHaveBeenCalledWith(line.run.dir, {
			status: "completed",
		});
	});

	it("no-ops on non-pending runs", () => {
		for (const status of [
			"completed",
			"error",
			"skipped",
			"processing",
			"canceled",
		]) {
			const ctx = makeMockCtx();
			actionComplete(makeState(), makeRunLine(status), ctx);
			expect(ctx.persistRunMeta).not.toHaveBeenCalled();
		}
	});

	it("no-ops on group lines", () => {
		const ctx = makeMockCtx();
		actionComplete(makeState(), makeGroupLine(), ctx);
		expect(ctx.persistRunMeta).not.toHaveBeenCalled();
	});
});

describe("actionPending", () => {
	it("marks a completed run as pending and persists", () => {
		const line = makeRunLine("completed");
		const ctx = makeMockCtx();
		actionPending(makeState(), line, ctx);
		expect(line.run.meta.status).toBe("pending");
		expect(ctx.persistRunMeta).toHaveBeenCalledWith(line.run.dir, {
			status: "pending",
		});
	});

	it("no-ops on non-completed runs", () => {
		for (const status of [
			"pending",
			"error",
			"skipped",
			"processing",
			"canceled",
		]) {
			const ctx = makeMockCtx();
			actionPending(makeState(), makeRunLine(status), ctx);
			expect(ctx.persistRunMeta).not.toHaveBeenCalled();
		}
	});
});

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
	it("calls stopTask and reloads when group is running", () => {
		const reloaded = makeState({ cursor: 99 });
		const ctx = makeMockCtx({ reload: () => reloaded });
		const next = actionStop(
			makeState(),
			makeGroupLine({ task: "my-task", running: true }),
			ctx,
		);
		expect(ctx.stopTask).toHaveBeenCalledWith("my-task");
		expect(next).toBe(reloaded);
	});

	it("no-ops when group is not running", () => {
		const state = makeState();
		const ctx = makeMockCtx();
		expect(actionStop(state, makeGroupLine({ running: false }), ctx)).toBe(
			state,
		);
		expect(ctx.stopTask).not.toHaveBeenCalled();
	});

	it("no-ops on run lines", () => {
		const state = makeState();
		const ctx = makeMockCtx();
		expect(actionStop(state, makeRunLine("processing"), ctx)).toBe(state);
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
